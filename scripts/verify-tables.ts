import postgres from "postgres";

async function main() {
  const url =
    process.env.DATABASE_URL?.trim() || "postgres://postgres@localhost:5499/homixliving";
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'portal' ORDER BY table_name`;
  const names = tables.map((row) => String(row.table_name));
  console.log(`portal tables (${names.length}): ${names.join(", ")}`);

  // Keep in sync with src/db/ensure-schema.ts.
  const expected = [
    "agent_payment_profiles",
    "agent_payouts",
    "agents",
    "audit_log",
    "buildings",
    "checklist_items",
    "commerce_charges",
    "commerce_orders",
    "deal_documents",
    "invoice_send_log",
    "invoices",
    "notifications",
    "rental_deal_agents",
    "rental_deals",
    "resources",
    "sale_deal_agents",
    "sale_deals",
    "settings",
    "stripe_events",
    "teams",
    "training_video_views",
    "training_videos",
  ];
  const missing = expected.filter((t) => !names.includes(t));
  const extra = names.filter((t) => !expected.includes(t));
  if (missing.length) console.error("MISSING:", missing.join(", "));
  if (extra.length) console.warn("EXTRA (legacy?):", extra.join(", "));

  const agentCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'portal' AND table_name = 'agents'`;
  const cols = agentCols.map((row) => String(row.column_name));
  console.log("\n--- portal.agents columns ---");
  console.log(cols.join(", "));
  console.log("\n--- checks ---");
  console.log("has is_admin :", cols.includes("is_admin"));
  console.log("has is_active:", cols.includes("is_active"));
  console.log("has user_id  :", cols.includes("user_id"), "(should be false)");

  const counts = await sql`
    SELECT (SELECT COUNT(*) FROM portal.buildings) AS buildings,
           (SELECT COUNT(*) FROM portal.settings) AS settings,
           (SELECT COUNT(*) FROM portal.agents) AS agents`;
  console.log("\nrow counts:", counts[0]);
  await sql.end({ timeout: 2 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
