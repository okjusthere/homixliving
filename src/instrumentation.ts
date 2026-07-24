/**
 * Boot-time schema self-heal. Database credentials are Sensitive in Vercel,
 * so DDL can only run where the credentials live — and a deploy whose code
 * queries a not-yet-added column would 500 until someone triggers
 * /api/admin/ensure-schema. This narrows that window: on server start, one
 * cheap information_schema probe checks the newest schema marker and runs the
 * idempotent ensure-schema only when the database is behind.
 *
 * Next.js awaits whatever `register()` returns before the instance serves its
 * first request — so this MUST NOT await the DB round-trip itself. An
 * intermittently slow/unreachable pooler would otherwise stall every cold
 * start by however long the connection attempt takes (seen in production:
 * CONNECT_TIMEOUT on the shared pgClient, delaying the first real request on
 * that instance). Kick the check off in the background instead; the existing
 * manual /api/admin/ensure-schema (and the resources-import self-heal) remain
 * the safety net for the brief post-deploy window if a request beats it.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  void healSchemaIfBehind();
}

async function healSchemaIfBehind() {
  try {
    const { pgClient } = await import("@/db");

    const [state] = await pgClient`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'portal'
            AND table_name = 'agents'
            AND column_name = 'account_status'
        ) AS portal_ready,
        (
          to_regclass('public.agents') IS NULL
          OR EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'agents'
              AND column_name = 'visibility_status'
          )
        ) AS public_ready`;
    if (state?.portal_ready && state?.public_ready) return;

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
