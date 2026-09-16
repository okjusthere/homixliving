import assert from "node:assert/strict";
import { db } from "@/db";
import { licensedCompanies } from "@/db/schema";

// CI copies schema only. Each suite must explicitly seed its foreign-key basis,
// rather than depending on a prior test or a developer's already-seeded database.
export async function seedDosTestCompanies() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) &&
    url.pathname === "/homix_onboarding_integration", "Isolated test database only");
  await db.insert(licensedCompanies).values([
    { id: "homix_realty" as const, legalName: "Homix Realty Inc." },
    { id: "homix_living" as const, legalName: "Homix Living Inc." },
  ].map(company => ({ ...company, address: "Synthetic only", brokerName: "Synthetic Broker",
    brokerTitle: "Broker", brokerEmail: "qa-company@example.invalid" }))).onConflictDoNothing();
}
