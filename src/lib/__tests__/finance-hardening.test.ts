import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, closeDatabaseConnections } from "@/db";
import { agentPayouts, agents, sponsorPlanRewards } from "@/db/schema";
import { applyPayoutToObligations, reversePayoutApplications } from "../compensation-ledger";

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [sponsor, referred] = await db.insert(agents).values([
    { name: "Finance Sponsor", email: `finance-sponsor-${suffix}@example.com`, accountStatus: "active" },
    { name: "Finance Recruit", email: `finance-recruit-${suffix}@example.com`, accountStatus: "active" },
  ]).returning();

  try {
    const [reward] = await db.insert(sponsorPlanRewards).values({
      sourceKey: `finance-test:${suffix}`,
      sponsorAgentId: sponsor.id,
      referredAgentId: referred.id,
      amountCents: 10_000,
      paidCents: 0,
      status: "accrued",
      earnedAt: new Date().toISOString(),
      availableAt: new Date().toISOString(),
    }).returning();

    const results = await Promise.all(["a", "b"].map((key) => db.transaction(async (tx) => {
      const [payout] = await tx.insert(agentPayouts).values({
        agentId: sponsor.id,
        amountCents: 10_000,
        method: "check",
        reference: `race-${key}`,
        paidAt: "2026-08-18",
        idempotencyKey: `finance-race-${suffix}-${key}`,
      }).returning();
      const application = await applyPayoutToObligations(tx, {
        payoutId: payout.id,
        recipientAgentId: sponsor.id,
        amountCents: payout.amountCents,
      });
      return { payout, application };
    })));

    assert.deepEqual(results.map((row) => row.application.appliedCents).sort((a, b) => a - b), [0, 10_000]);
    const [paidReward] = await db.select().from(sponsorPlanRewards).where(eq(sponsorPlanRewards.id, reward.id));
    assert.equal(paidReward.paidCents, 10_000);
    assert.equal(paidReward.status, "paid");

    const appliedPayout = results.find((row) => row.application.appliedCents === 10_000)!.payout;
    await db.transaction((tx) => reversePayoutApplications(tx, appliedPayout.id));
    const [reversedReward] = await db.select().from(sponsorPlanRewards).where(eq(sponsorPlanRewards.id, reward.id));
    assert.equal(reversedReward.paidCents, 0);
    assert.equal(reversedReward.status, "accrued");

    console.log("finance hardening tests passed");
  } finally {
    await db.delete(agentPayouts).where(inArray(agentPayouts.agentId, [sponsor.id, referred.id]));
    await db.delete(sponsorPlanRewards).where(eq(sponsorPlanRewards.sourceKey, `finance-test:${suffix}`));
    await db.delete(agents).where(inArray(agents.id, [sponsor.id, referred.id]));
    await closeDatabaseConnections();
  }
}

main().catch(async (error) => {
  console.error(error);
  await closeDatabaseConnections();
  process.exitCode = 1;
});
