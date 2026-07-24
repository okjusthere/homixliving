import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pgClient } from "@/db";
import {
  contractAgentLifecycle,
  ensureSchema,
  getAgentLifecycleSchemaState,
} from "@/db/ensure-schema";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs the idempotent schema DDL (CREATE SCHEMA/TABLE/INDEX IF NOT EXISTS)
// against the database THIS deployment is configured for. Exists because the
// database credentials are Sensitive in Vercel and can't be pulled locally —
// schema rollouts happen where the credentials live.
//
// Auth: an admin session, CRON_SECRET, or a temporary
// LIFECYCLE_MIGRATION_SECRET bearer. The default expand action is safe to
// re-run. Contract requires an explicit confirmation query because it drops
// only the retired compatibility columns.
async function isAuthorized(request: Request): Promise<{ ok: boolean; actor: string }> {
  const authorization = request.headers.get("authorization") || "";
  const secrets = [
    ["cron-secret", process.env.CRON_SECRET?.trim()],
    ["lifecycle-migration", process.env.LIFECYCLE_MIGRATION_SECRET?.trim()],
  ] as const;
  for (const [actor, secret] of secrets) {
    if (secret && authorization === `Bearer ${secret}`) {
      return { ok: true, actor };
    }
  }
  try {
    const session = await auth();
    if (session?.user?.isAdmin) {
      return { ok: true, actor: session.user.email || "admin" };
    }
  } catch {
    // No request scope / no session — fall through to unauthorized.
  }
  return { ok: false, actor: "" };
}

export async function POST(request: Request) {
  const authz = await isAuthorized(request);
  if (!authz.ok) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const phase = url.searchParams.get("phase") || "expand";
    if (phase !== "expand" && phase !== "contract" && phase !== "status") {
      return NextResponse.json({ error: "Invalid migration phase." }, { status: 400 });
    }
    if (
      phase === "contract" &&
      url.searchParams.get("confirm") !== "drop-legacy-columns"
    ) {
      return NextResponse.json(
        { error: "Contract requires confirm=drop-legacy-columns." },
        { status: 400 },
      );
    }

    if (phase === "expand") {
      await ensureSchema(pgClient);
    } else if (phase === "contract") {
      await contractAgentLifecycle(pgClient);
    }

    const lifecycle = await getAgentLifecycleSchemaState(pgClient);
    const tables = await pgClient`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'portal' ORDER BY table_name`;
    const tableNames = tables.map((row) => String(row.table_name));
    await logAudit(
      { user: { email: authz.actor } },
      "ensure_schema",
      "setting",
      "schema",
      `执行 schema ${phase}：${tableNames.length} 张表就绪`,
    );
    return NextResponse.json({ ok: true, phase, lifecycle, tables: tableNames });
  } catch (error) {
    console.error("ensure-schema failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ensure-schema failed" },
      { status: 500 }
    );
  }
}
