import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";
import { auth } from "@/auth";
import { ensureSchema } from "@/db/ensure-schema";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs the idempotent schema DDL (CREATE TABLE/INDEX IF NOT EXISTS +
// add-column-if-missing) against the database THIS deployment is configured
// for. Exists because the Turso credentials are Sensitive in Vercel and can't
// be pulled locally — schema rollouts happen where the credentials live.
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

  const url = process.env.TURSO_DATABASE_URL?.trim();
  if (!url) {
    return NextResponse.json(
      { error: "TURSO_DATABASE_URL is not configured." },
      { status: 503 }
    );
  }

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  try {
    await ensureSchema(client);
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tableNames = tables.rows.map((row) => String(row.name));
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
