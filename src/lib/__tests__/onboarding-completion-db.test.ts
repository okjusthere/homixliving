import assert from "node:assert/strict";
import { verifiedDosFixture } from "./dos-fixture";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, closeDatabaseConnections } from "@/db";
import { agents, commerceOrders, sponsorPlanRewards } from "@/db/schema";
import { onboardingReceipts } from "@/db/onboarding-schema";
import { completeOnboarding, recordOnboardingReceipt, receiptInput, OnboardingCommandError } from "@/lib/onboarding-admin";
import { onboardingFeeQuote } from "@/lib/onboarding-fees";
import { onboardingWorkflow } from "@/lib/onboarding-workflow";
import { nyDate } from "@/lib/celebrations/calendar";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/homix_onboarding_integration", "Dedicated local test database only");
  const [admin, ordinary] = await db.insert(agents).values([
    { name: "Synthetic Approver", email: `qa-${randomUUID()}@example.invalid`, isAdmin: true, accountStatus: "active" as const },
    { name: "Synthetic Sponsor", email: `qa-${randomUUID()}@example.invalid`, accountStatus: "active" as const },
  ]).returning();
  async function subject(overrides: Partial<typeof agents.$inferInsert> = {}) {
    return (await db.insert(agents).values({ name: "Synthetic Preferred",
      email: `qa-${randomUUID()}@example.invalid`,
      ...verifiedDosFixture,
      accountStatus: "pending", plan: "solo", affiliationTermMonths: 12,
      onboardingCompletedAt: new Date().toISOString(), signingRequestId: randomUUID(),
      agreementAgentSignedAt: new Date().toISOString(), agreementStatus: "sent",
      referredByAgentId: ordinary.id, ...overrides }).returning())[0];
  }
  const agent = async (id: number) => (await db.select().from(agents).where(eq(agents.id, id)))[0];
  const rows = async (id: number) => ({
    receipts: await db.select().from(onboardingReceipts).where(eq(onboardingReceipts.agentId, id)),
    orders: await db.select().from(commerceOrders).where(eq(commerceOrders.agentId, id)),
    rewards: await db.select().from(sponsorPlanRewards).where(eq(sponsorPlanRewards.referredAgentId, id)),
  });
  const waiver = { action: "complete_onboarding", mode: "waiver", confirmed: true,
    idempotencyKey: randomUUID(), reason: "Company approved full onboarding fee waiver" };
  const free = await subject();
  await assert.rejects(completeOnboarding(free.id, ordinary.id, waiver), (e) => e instanceof OnboardingCommandError && e.status === 403);
  await assert.rejects(completeOnboarding(free.id, admin.id, { ...waiver, confirmed: false }));
  await assert.rejects(completeOnboarding(free.id, admin.id, { ...waiver, reason: "" }));
  const results = await Promise.all([completeOnboarding(free.id, admin.id, waiver), completeOnboarding(free.id, admin.id, waiver)]);
  assert.equal(results.filter(r => r.replayed).length, 1);
  const activated = await agent(free.id);
  assert.equal(activated.accountStatus, "active");
  assert.equal(activated.paymentStatus, "not_required");
  assert.equal(activated.affiliationPaidAt, null);
  assert.equal(activated.agreementStatus, "sent", "Do not fabricate company signatures");
  assert.equal(onboardingWorkflow(activated, null).next, "countersign");
  assert.equal(onboardingFeeQuote(activated).dueAmountCents, 0);
  assert.deepEqual(await rows(free.id), { receipts: [], orders: [], rewards: [] });
  await assert.rejects(completeOnboarding(free.id, admin.id, { ...waiver, reason: "Different request" }), OnboardingCommandError);

  for (const overrides of [{ onboardingCompletedAt: null }, { agreementAgentSignedAt: null },
    { agreementStatus: "voided" as const }, { plan: "team_member" as const }]) {
    const blocked = await subject(overrides);
    await assert.rejects(completeOnboarding(blocked.id, admin.id, { ...waiver, idempotencyKey: randomUUID() }), OnboardingCommandError);
    assert.equal((await agent(blocked.id)).accountStatus, "pending");
    assert.equal((await agent(blocked.id)).onboardingFeeAdjustment, null);
  }
  const partial = await subject();
  const total = onboardingFeeQuote(partial).originalAmountCents;
  const partialInput = { action: "complete_onboarding", mode: "payment", confirmed: true,
    idempotencyKey: randomUUID(), waiverAmountCents: 10000, reason: "Company approved partial discount",
    receipt: { amountCents: total - 10000, currency: "usd", method: "check", reference: `P-${randomUUID()}`, receivedAt: nyDate() } };
  await completeOnboarding(partial.id, admin.id, partialInput);
  const partialRows = await rows(partial.id);
  assert.equal(partialRows.orders.length, 1);
  assert.equal(partialRows.orders[0].amountCents, total - 10000);
  assert.equal(partialRows.rewards[0].amountCents, Math.round((total - 10000 - 2000) * 0.1), "No rewards on waived fees");
  assert.equal((await agent(partial.id)).accountStatus, "active");

  const rollback = await subject();
  await assert.rejects(completeOnboarding(rollback.id, admin.id, { ...partialInput,
    idempotencyKey: randomUUID(), receipt: { ...partialInput.receipt, amountCents: 100, reference: `rollback-${randomUUID()}` } }), OnboardingCommandError);
  assert.deepEqual(await rows(rollback.id), { receipts: [], orders: [], rewards: [] });
  assert.equal((await agent(rollback.id)).onboardingFeeAdjustment, null, "Mismatch rolls the entire operation back");

  const prepaid = await subject();
  assert.equal(receiptInput.parse({ agentId: prepaid.id, amountCents: total,
    method: "check", reference: "11", receivedAt: nyDate(), idempotencyKey: randomUUID() }).reference, "11", "Two-character references remain valid without persisting a globally reused test reference");
  const existing = await recordOnboardingReceipt(admin.id, { agentId: prepaid.id, amountCents: total,
    method: "check", reference: `prepaid-${randomUUID()}`, receivedAt: nyDate(), idempotencyKey: randomUUID() });
  await completeOnboarding(prepaid.id, admin.id, { action: "complete_onboarding", mode: "payment", confirmed: true,
    idempotencyKey: randomUUID(), receiptId: existing.receipt.id });
  assert.equal((await rows(prepaid.id)).receipts.length, 1, "Reuse the recorded receipt");
  assert.equal((await agent(prepaid.id)).paymentStatus, "paid");

  const stranger = await subject();
  await assert.rejects(completeOnboarding(stranger.id, admin.id, { action: "complete_onboarding", mode: "payment", confirmed: true,
    idempotencyKey: randomUUID(), receiptId: existing.receipt.id }), OnboardingCommandError);
  await assert.rejects(recordOnboardingReceipt(admin.id, { agentId: stranger.id, amountCents: 0,
    method: "cash", reference: "", receivedAt: nyDate(), idempotencyKey: randomUUID() }));
  await completeOnboarding(stranger.id, admin.id, { action: "complete_onboarding", mode: "payment", confirmed: true,
    idempotencyKey: randomUUID(), receipt: { amountCents: total, method: "cash", reference: "", receivedAt: nyDate() } });
  assert.equal((await agent(stranger.id)).accountStatus, "active", "Cash does not need a made-up cheque number");
  console.log("PASS: atomic approval; full/partial waiver; no fictitious receipts/rewards; concurrency/idempotency; readiness/RBAC/ownership gates; rollback; short reference and receipt reuse");
}
main().finally(closeDatabaseConnections).catch(error => { console.error(error); process.exitCode = 1; });
