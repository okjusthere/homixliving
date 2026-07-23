import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pgClient } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs the idempotent schema DDL (CREATE SCHEMA/TABLE/INDEX IF NOT EXISTS)
// against the database THIS deployment is configured for. Exists because the
// database credentials are Sensitive in Vercel and can't be pulled locally —
// schema rollouts happen where the credentials live.
//
// Auth: an admin session OR the CRON_SECRET bearer. Safe to re-run any time;
// it never drops or rewrites data.
async function isAuthorized(request: Request): Promise<{ ok: boolean; actor: string }> {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") || "";
  if (configuredSecret && authorization === `Bearer ${configuredSecret}`) {
    return { ok: true, actor: "cron-secret" };
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
    await ensureSchema(pgClient);
    const tables = await pgClient`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'portal' ORDER BY table_name`;
    const tableNames = tables.map((row) => String(row.table_name));
    await logAudit(
      { user: { email: authz.actor } },
      "ensure_schema",
      "setting",
      "schema",
      `执行 ensure-schema：${tableNames.length} 张表就绪`
    );
    return NextResponse.json({ ok: true, tables: tableNames });
  } catch (error) {
    console.error("ensure-schema failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ensure-schema failed" },
      { status: 500 }
    );
  }
}
