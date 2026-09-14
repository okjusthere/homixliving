import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, closeDatabaseConnections } from "@/db";
import { agents } from "@/db/schema";
import { retryOnboardingWebsiteSync } from "@/lib/onboarding-activation";
import { onboardingTasks } from "@/lib/onboarding-tasks";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/homix_onboarding_integration");
  const [agent] = await db.insert(agents).values({ name: "Synthetic Website Retry", legalName: "Synthetic Legal",
    email: `qa-${randomUUID()}@example.invalid`, accountStatus: "active", agreementStatus: "completed", paymentStatus: "not_required" }).returning();
  const originalFetch = globalThis.fetch;
  const originalSecret = process.env.AGENTS_REVALIDATE_SECRET;
  process.env.AGENTS_REVALIDATE_SECRET = "synthetic-test-only";
  const current = async () => (await db.select().from(agents).where(eq(agents.id, agent.id)))[0];
  const records = { contracts: [], receipts: [], grants: [] };
  try {
    globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
    assert.deepEqual(await retryOnboardingWebsiteSync(agent.id), { publicProfileReady: false });
    const failed = await current();
    assert.equal(failed.accountStatus, "active");
    assert.equal(failed.agreementStatus, "completed");
    assert.equal(failed.onboardingWebsiteSync?.status, "pending");
    assert.ok(onboardingTasks(failed, null, records).tasks.includes("website"));
    globalThis.fetch = async (_input, init) => Response.json(init?.method === "POST"
      ? { success: true, verificationStatus: "verified" } : { linked: true, profile: {} });
    assert.deepEqual(await retryOnboardingWebsiteSync(agent.id), { publicProfileReady: true });
    const retried = await current();
    assert.equal(retried.onboardingWebsiteSync?.status, "complete");
    assert.equal(onboardingTasks(retried, null, records).tasks.includes("website"), false);
    assert.equal(retried.paymentStatus, "not_required");
    globalThis.fetch = async () => { throw new Error("A completed callback must not republish or unhide the website"); };
    assert.deepEqual(await retryOnboardingWebsiteSync(agent.id), { publicProfileReady: true });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.AGENTS_REVALIDATE_SECRET;
    else process.env.AGENTS_REVALIDATE_SECRET = originalSecret;
  }
  console.log("PASS: website outage preserves active access, persists an actionable task, and clears it on successful retry");
}
main().finally(closeDatabaseConnections).catch(error => { console.error(error); process.exitCode = 1; });
