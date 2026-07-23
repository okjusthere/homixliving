/**
 * One-shot data migration: Turso (SQLite) → Supabase Postgres (portal schema).
 *
 *   TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… \
 *   DATABASE_URL=postgres://…pooler.supabase.com:6543/postgres \
 *   npx tsx scripts/migrate-turso-to-pg.ts [--truncate]
 *
 * - Copies every portal table in FK-safe order, converting SQLite's 0/1
 *   booleans and JSON-string line_items on the way.
 * - --truncate empties the target portal tables first (needed for re-runs).
 * - Resets identity sequences so new inserts continue after imported ids.
 * - Prints a per-table source/target row-count comparison at the end;
 *   exits non-zero on any mismatch.
 *
 * Run ensure-schema on the target FIRST (deploy boot does it, or:
 * curl -X POST -H "Authorization: Bearer $CRON_SECRET" .../api/admin/ensure-schema)
 */
import { createClient } from "@libsql/client";
import postgres from "postgres";

const BOOLEAN_COLUMNS: Record<string, string[]> = {
  buildings: ["is_out_of_state"],
  agents: ["is_admin", "is_active"],
  rental_deal_agents: ["is_primary"],
  sale_deal_agents: ["is_primary"],
  training_videos: ["is_published"],
  resources: ["is_published"],
};

const JSON_COLUMNS: Record<string, string[]> = {
  invoices: ["line_items"],
};

// FK-safe copy order. teams.leader_agent_id is backfilled after agents exist.
const TABLES = [
  "buildings",
  "teams",
  "agents",
  "rental_deals",
  "rental_deal_agents",
  "sale_deals",
  "sale_deal_agents",
  "invoices",
  "invoice_send_log",
  "commerce_orders",
  "commerce_charges",
  "stripe_events",
  "training_videos",
  "training_video_views",
  "resources",
  "checklist_items",
  "notifications",
  "audit_log",
  "deal_documents",
  "agent_payment_profiles",
  "agent_payouts",
  "settings",
];

const HAS_ID_SEQUENCE = new Set(TABLES.filter(
  (t) => !["rental_deal_agents", "sale_deal_agents", "settings", "stripe_events"].includes(t),
));

function convertRow(table: string, row: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...row };
  for (const col of BOOLEAN_COLUMNS[table] ?? []) {
    if (out[col] !== null && out[col] !== undefined) out[col] = Boolean(Number(out[col]));
  }
  for (const col of JSON_COLUMNS[table] ?? []) {
    if (typeof out[col] === "string" && out[col]) {
      try {
        out[col] = JSON.parse(out[col] as string);
      } catch {
        out[col] = null;
      }
    }
  }
  // Defer the circular FK; backfilled after agents are in.
  if (table === "teams") out.leader_agent_id = null;
  return out;
}

async function main() {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const pgUrl = process.env.DATABASE_URL?.trim();
  if (!tursoUrl || !pgUrl) {
    console.error("Set TURSO_DATABASE_URL (+TURSO_AUTH_TOKEN) and DATABASE_URL.");
    process.exit(1);
  }
  const truncate = process.argv.includes("--truncate");

  const turso = createClient({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN });
  const sql = postgres(pgUrl, { prepare: false, max: 1, onnotice: () => {} });

  if (truncate) {
    console.log("Truncating target portal tables…");
    await sql.unsafe(
      `TRUNCATE ${TABLES.map((t) => `portal.${t}`).join(", ")} RESTART IDENTITY CASCADE`,
    );
  }

  const counts: { table: string; src: number; dst: number }[] = [];
  const teamLeaders: { id: number; leaderAgentId: number }[] = [];

  for (const table of TABLES) {
    let rows: Record<string, unknown>[] = [];
    try {
      const res = await turso.execute(`SELECT * FROM ${table}`);
      rows = res.rows as unknown as Record<string, unknown>[];
    } catch {
      console.log(`- ${table}: missing in source, skipped`);
      counts.push({ table, src: 0, dst: 0 });
      continue;
    }

    if (table === "teams") {
      for (const row of rows) {
        if (row.leader_agent_id != null) {
          teamLeaders.push({ id: Number(row.id), leaderAgentId: Number(row.leader_agent_id) });
        }
      }
    }

    // Project onto the TARGET's columns — legacy Turso tables accumulated
    // dead columns (e.g. agents.user_id) that portal.* deliberately dropped.
    const targetCols = new Set(
      (
        (await sql.unsafe(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'portal' AND table_name = '${table}'`,
        )) as unknown as { column_name: string }[]
      ).map((c) => c.column_name),
    );
    const dropped = rows.length
      ? Object.keys(rows[0]).filter((c) => !targetCols.has(c))
      : [];
    if (dropped.length) console.log(`  (dropping legacy columns: ${dropped.join(", ")})`);

    const converted = rows.map((row) => {
      const projected: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(convertRow(table, row))) {
        if (targetCols.has(k)) projected[k] = v;
      }
      return projected;
    });
    for (let i = 0; i < converted.length; i += 200) {
      const chunk = converted.slice(i, i + 200);
      if (chunk.length === 0) continue;
      const cols = Object.keys(chunk[0]);
      await sql`INSERT INTO ${sql(`portal.${table}`)} ${sql(chunk as never[], ...(cols as never[]))}`;
    }

    if (HAS_ID_SEQUENCE.has(table) && converted.length > 0) {
      await sql.unsafe(
        `SELECT setval(pg_get_serial_sequence('portal.${table}', 'id'),
           GREATEST((SELECT COALESCE(MAX(id), 0) FROM portal.${table}), 1))`,
      );
    }

    const [{ n }] = await sql.unsafe(
      `SELECT count(*)::int AS n FROM portal.${table}`,
    ) as unknown as [{ n: number }];
    counts.push({ table, src: rows.length, dst: Number(n) });
    console.log(`- ${table}: ${rows.length} → ${n}`);
  }

  for (const { id, leaderAgentId } of teamLeaders) {
    await sql`UPDATE portal.teams SET leader_agent_id = ${leaderAgentId} WHERE id = ${id}`;
  }
  if (teamLeaders.length) console.log(`- teams.leader_agent_id backfilled (${teamLeaders.length})`);

  const mismatched = counts.filter((c) => c.src !== c.dst);
  console.log("\n=== summary ===");
  for (const c of counts) {
    console.log(`${c.src === c.dst ? "✓" : "✗"} ${c.table}: src=${c.src} dst=${c.dst}`);
  }
  await sql.end({ timeout: 3 });
  turso.close();
  if (mismatched.length) {
    console.error(`\nMISMATCH in ${mismatched.length} table(s).`);
    process.exit(1);
  }
  console.log("\nAll tables copied and verified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
