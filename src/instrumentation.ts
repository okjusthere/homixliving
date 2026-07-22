/**
 * Boot-time schema self-heal. Turso credentials are Sensitive in Vercel, so
 * DDL can only run where the credentials live — and a deploy whose code
 * queries a not-yet-added column would 500 until someone triggers
 * /api/admin/ensure-schema. This closes that window: on server start, one
 * cheap PRAGMA checks the newest schema marker and runs the idempotent
 * ensure-schema only when the database is behind.
 *
 * MARKER: bump `LATEST_COLUMN` whenever ensure-schema gains a new
 * table/column, so fresh deploys detect the gap.
 */
const LATEST_TABLE = "deal_documents";
const LATEST_COLUMN = "object_key";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  try {
    const { createClient } = await import("@libsql/client");
    const url = process.env.TURSO_DATABASE_URL?.trim() || "file:local.db";
    const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

    const info = await client.execute(`PRAGMA table_info(${LATEST_TABLE})`);
    const upToDate = info.rows.some((row) => row.name === LATEST_COLUMN);
    if (upToDate) return;

    console.log("Schema behind code — running ensure-schema at boot…");
    const { ensureSchema } = await import("@/db/ensure-schema");
    await ensureSchema(client);
    console.log("Boot-time ensure-schema complete.");
  } catch (error) {
    // Never block boot on the heal — worst case we're back to the old
    // behavior (admin endpoint / resources self-heal).
    console.error("Boot-time schema self-heal failed", error);
  }
}
