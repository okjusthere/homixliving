import { createClient } from "@libsql/client";

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  );
  const names = tables.rows.map((row) => String(row.name));
  console.log(`Tables (${names.length}): ${names.join(", ")}`);

  // Keep in sync with the CREATE TABLE statements in src/db/seed.ts.
  const expected = [
    "agents",
    "audit_log",
    "buildings",
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
    "training_videos",
  ];
  const missing = expected.filter((t) => !names.includes(t));
  const extra = names.filter(
    (t) => !expected.includes(t) && !t.startsWith("sqlite_")
  );
  if (missing.length) console.error("MISSING:", missing.join(", "));
  if (extra.length) console.warn("EXTRA (legacy?):", extra.join(", "));

  const agentsDdl = await client.execute(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='agents'"
  );
  const ddl = String(agentsDdl.rows[0]?.sql ?? "");
  console.log("\n--- agents CREATE TABLE ---");
  console.log(ddl);

  console.log("\n--- checks ---");
  console.log("has is_admin :", ddl.includes("is_admin"));
  console.log("has is_active:", ddl.includes("is_active"));
  console.log("has user_id  :", ddl.includes("user_id"), "(should be false)");

  const counts = await client.execute(
    "SELECT (SELECT COUNT(*) FROM buildings) AS buildings, (SELECT COUNT(*) FROM settings) AS settings, (SELECT COUNT(*) FROM agents) AS agents"
  );
  console.log("\nrow counts:", counts.rows[0]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
