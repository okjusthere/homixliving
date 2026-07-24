import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required.");
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

  const result = await sql<{ key: string; value: string | null }[]>`
    SELECT key, value FROM portal.settings ORDER BY key
  `;
  const rows = result.map((row) => ({
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
  await sql.end({ timeout: 2 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
