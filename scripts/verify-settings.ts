import { createClient } from "@libsql/client";

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const r = await client.execute(
    "SELECT key, value FROM settings ORDER BY key"
  );
  const rows = r.rows.map((row) => ({
    key: String(row.key),
    value: String(row.value ?? ""),
  }));

  console.log(`Total settings keys: ${rows.length}\n`);
  const wireKeys = rows.filter((row) => row.key.startsWith("wire_"));
  const achKeys = rows.filter((row) => row.key.startsWith("ach_"));
  const otherKeys = rows.filter(
    (row) => !row.key.startsWith("wire_") && !row.key.startsWith("ach_")
  );

  console.log("--- Wire keys (should be 6, all empty) ---");
  for (const row of wireKeys) {
    console.log(`  ${row.key.padEnd(28)} = ${JSON.stringify(row.value)}`);
  }

  console.log("\n--- ACH keys (should be unchanged) ---");
  for (const row of achKeys) {
    console.log(`  ${row.key.padEnd(28)} = ${JSON.stringify(row.value)}`);
  }

  console.log("\n--- Other keys ---");
  for (const row of otherKeys) {
    console.log(`  ${row.key.padEnd(28)} = ${JSON.stringify(row.value)}`);
  }

  const expectedWire = [
    "wire_account_name",
    "wire_bank_name",
    "wire_routing_number",
    "wire_account_number",
    "wire_bank_address",
    "wire_swift_code",
  ];
  const missing = expectedWire.filter(
    (k) => !wireKeys.some((row) => row.key === k)
  );
  if (missing.length) {
    console.error("\n❌ MISSING wire keys:", missing.join(", "));
    process.exit(1);
  }
  console.log("\n✅ All 6 wire keys present.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
