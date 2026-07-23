/**
 * Boot-time schema self-heal. Database credentials are Sensitive in Vercel,
 * so DDL can only run where the credentials live — and a deploy whose code
 * queries a not-yet-added column would 500 until someone triggers
 * /api/admin/ensure-schema. This closes that window: on server start, one
 * cheap information_schema probe checks the newest schema marker and runs the
 * idempotent ensure-schema only when the database is behind.
 *
 * MARKER: bump `LATEST_COLUMN` whenever ensure-schema gains a new
 * table/column, so fresh deploys detect the gap.
 */
const LATEST_TABLE = "agent_payouts";
const LATEST_COLUMN = "amount_cents";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  try {
    const { pgClient } = await import("@/db");

    const rows = await pgClient`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'portal'
        AND table_name = ${LATEST_TABLE}
        AND column_name = ${LATEST_COLUMN}
      LIMIT 1`;
    if (rows.length > 0) return;

    console.log("Schema behind code — running ensure-schema at boot…");
    const { ensureSchema } = await import("@/db/ensure-schema");
    await ensureSchema(pgClient);
    console.log("Boot-time ensure-schema complete.");
  } catch (error) {
    // Never block boot on the heal — worst case we're back to the old
    // behavior (admin endpoint / resources self-heal).
    console.error("Boot-time schema self-heal failed", error);
  }
}
