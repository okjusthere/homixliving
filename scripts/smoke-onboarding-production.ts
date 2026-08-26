import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { TransactionRollbackError } from "drizzle-orm/errors";
import {
  agents,
  commerceOrders,
  licensedCompanies,
  sponsorPlanRewards,
  teamCompensationConfigs,
  teamJoinRequests,
  teams,
} from "../src/db/schema";
import { closeDatabaseConnections, db } from "../src/db";
import { computeCompensationV31 } from "../src/lib/compensation-v31";
import { onboardingPaymentProduct } from "../src/lib/onboarding";
import { settlePlanPayment } from "../src/lib/plan-payments";

async function main() {
if (process.env.ALLOW_PRODUCTION_SMOKE !== "1") {
  throw new Error("Set ALLOW_PRODUCTION_SMOKE=1 to run the rollback-only production smoke test.");
}

const now = new Date().toISOString();
const today = now.slice(0, 10);
const runId = `smoke-${Date.now()}`;
let report: Record<string, unknown> = {};
let completed = false;

try {
  await db.transaction(async (tx) => {
    const [company] = await tx
      .select()
      .from(licensedCompanies)
      .where(eq(licensedCompanies.id, "homix_realty"))
      .limit(1);
    assert.ok(company, "Homix Realty production company seed is missing");

    const [leader] = await tx.insert(agents).values({
      name: `${runId} Team Leader`,
      legalName: `${runId} Team Leader`,
      email: `${runId}-leader@example.invalid`,
      licensedCompany: company.legalName,
      licensedCompanyId: company.id,
      companySelectedAt: now,
      companyRequirementsAcknowledgedAt: now,
      accountStatus: "active",
      plan: "solo_pro",
      splitPct: 100,
      agreementStatus: "completed",
      paymentStatus: "paid",
      onboardingStage: "complete",
      onboardingCompletedAt: now,
    }).returning();
    const [sponsor] = await tx.insert(agents).values({
      name: `${runId} Sponsor`,
      legalName: `${runId} Sponsor`,
      email: `${runId}-sponsor@example.invalid`,
      licensedCompany: company.legalName,
      licensedCompanyId: company.id,
      companySelectedAt: now,
      companyRequirementsAcknowledgedAt: now,
      accountStatus: "active",
      plan: "solo",
      splitPct: 85,
      agreementStatus: "completed",
      paymentStatus: "paid",
      onboardingStage: "complete",
      onboardingCompletedAt: now,
    }).returning();
    const [team] = await tx.insert(teams).values({
      name: `${runId} Team`,
      companyId: company.id,
      leaderAgentId: leader.id,
      status: "active",
      notes: "Rollback-only onboarding production smoke test",
    }).returning();
    const [config] = await tx.insert(teamCompensationConfigs).values({
      teamId: team.id,
      version: 1,
      effectiveFrom: today,
      createdByEmail: "smoke@homixny.com",
    }).returning();
    assert.equal(config.defaultTeamSplitPct, 10);
    assert.equal(config.teamLeadSplitPct, 10);
    assert.equal(config.teamCapCents, null);

    const teamMemberValues = (label: string, referredByAgentId: number) => ({
      name: `${runId} ${label}`,
      legalName: `${runId} ${label}`,
      email: `${runId}-${label.toLowerCase().replaceAll(" ", "-")}@example.invalid`,
      licensedCompany: company.legalName,
      licensedCompanyId: company.id,
      companySelectedAt: now,
      companyRequirementsAcknowledgedAt: now,
      accountStatus: "pending" as const,
      plan: "team_member" as const,
      splitPct: 90,
      teamId: team.id,
      teamTermsConfigId: config.id,
      teamTermsEffectiveFrom: config.effectiveFrom,
      onboardingCompletedAt: now,
      onboardingStage: "agreement" as const,
      agreementStatus: "not_started" as const,
      paymentStatus: "pending" as const,
      referredByAgentId,
      affiliationTermMonths: 12,
    });
    const [sameSponsor] = await tx.insert(agents)
      .values(teamMemberValues("Same Sponsor", leader.id)).returning();
    const [differentSponsor] = await tx.insert(agents)
      .values(teamMemberValues("Different Sponsor", sponsor.id)).returning();

    for (const member of [sameSponsor, differentSponsor]) {
      await tx.insert(teamJoinRequests).values({
        agentId: member.id,
        teamId: team.id,
        sponsorAgentId: member.referredByAgentId,
        status: "accepted",
        acceptedConfigId: config.id,
        decidedByAgentId: leader.id,
        decidedAt: now,
        decisionReason: "Rollback-only production smoke test",
      });
    }

    const compensation = (member: typeof sameSponsor) => computeCompensationV31({
      dealType: "rental",
      grossCommission: 10_000,
      source: "self",
      participants: [{
        agentId: member.id,
        sharePct: 100,
        plan: member.plan,
        companyCapUsed: 0,
        teamId: team.id,
        teamConfigId: config.id,
        teamLeaderAgentId: leader.id,
        sponsorAgentId: member.referredByAgentId,
        teamSplitPct: config.defaultTeamSplitPct,
        teamCapAmount: config.teamCapCents == null ? null : config.teamCapCents / 100,
      }],
    });
    const sameResult = compensation(sameSponsor);
    const differentResult = compensation(differentSponsor);
    for (const result of [sameResult, differentResult]) {
      assert.equal(result.companyDollar, 1_000);
      assert.equal(result.teamAllocation, 900);
      assert.equal(result.sponsorAmount, 100);
      assert.equal(result.agentNetTotal, 8_100);
    }
    assert.equal(sameResult.allocations[0].teamLeaderAgentId, sameResult.allocations[0].sponsorAgentId);
    assert.notEqual(
      differentResult.allocations[0].teamLeaderAgentId,
      differentResult.allocations[0].sponsorAgentId,
    );

    const [solo] = await tx.insert(agents).values({
      name: `${runId} Solo`,
      legalName: `${runId} Solo`,
      email: `${runId}-solo@example.invalid`,
      licensedCompany: company.legalName,
      licensedCompanyId: company.id,
      companySelectedAt: now,
      companyRequirementsAcknowledgedAt: now,
      accountStatus: "pending",
      plan: "solo",
      splitPct: 85,
      onboardingCompletedAt: now,
      onboardingStage: "agreement",
      agreementStatus: "not_started",
      paymentStatus: "pending",
      affiliationTermMonths: 12,
    }).returning();
    assert.equal(onboardingPaymentProduct(solo.plan, solo.affiliationTermMonths), "one_year_membership");

    const [offlineAgent] = await tx.insert(agents).values({
      name: `${runId} Offline Payment`,
      legalName: `${runId} Offline Payment`,
      email: `${runId}-offline@example.invalid`,
      licensedCompany: company.legalName,
      licensedCompanyId: company.id,
      companySelectedAt: now,
      companyRequirementsAcknowledgedAt: now,
      accountStatus: "pending",
      plan: "solo",
      splitPct: 85,
      referredByAgentId: sponsor.id,
      onboardingCompletedAt: now,
      onboardingStage: "payment",
      agreementStatus: "completed",
      agreementCompletedAt: now,
      paymentStatus: "pending",
      affiliationTermMonths: 12,
    }).returning();
    const [order] = await tx.insert(commerceOrders).values({
      agentId: offlineAgent.id,
      productKey: "one_year_membership",
      productName: "One-year membership",
      billingMode: "one_time",
      amountCents: 28_800,
      currency: "usd",
      status: "paid",
      paymentChannel: "offline",
      offlineMethod: "check",
      offlineReference: runId,
      verifiedByEmail: "smoke@homixny.com",
      externalPaymentKey: `offline:${runId}`,
      customerName: offlineAgent.legalName,
      customerEmail: offlineAgent.email,
      referralHasAgent: "yes",
      workspaceStatus: "not_required",
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    }).returning();
    await settlePlanPayment(tx, {
      order,
      sourceKey: order.externalPaymentKey!,
      amountCents: order.amountCents,
      earnedAt: now,
    });
    const [paidAgent] = await tx.select().from(agents).where(eq(agents.id, offlineAgent.id)).limit(1);
    const [reward] = await tx.select().from(sponsorPlanRewards).where(and(
      eq(sponsorPlanRewards.referredAgentId, offlineAgent.id),
      eq(sponsorPlanRewards.sourceKey, order.externalPaymentKey!),
    )).limit(1);
    assert.equal(paidAgent.paymentStatus, "paid");
    assert.equal(paidAgent.onboardingStage, "review");
    assert.equal(reward.amountCents, 2_880);

    report = {
      database: "production (transaction rolled back)",
      teamDefaults: { splitPct: config.defaultTeamSplitPct, cap: "No Team Cap" },
      solo: { paymentProduct: "one_year_membership", readyForAgreement: true },
      teamSameSponsor: { teamAllocation: 900, sponsorReward: 100, agentNet: 8_100 },
      teamDifferentSponsor: { teamAllocation: 900, sponsorReward: 100, agentNet: 8_100 },
      offlinePayment: { status: paidAgent.paymentStatus, sponsorPlanRewardCents: reward.amountCents },
    };
    completed = true;
    tx.rollback();
  });
} catch (error) {
  if (!(error instanceof TransactionRollbackError)) throw error;
} finally {
  await closeDatabaseConnections();
}

assert.ok(completed, "Smoke test did not produce a report");
process.stdout.write(`${JSON.stringify({ status: "passed", ...report }, null, 2)}\n`);
}

void main();
