import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  agentPayouts,
  compensationObligations,
  compensationReceipts,
  dealCompensationAllocations,
  dealCompensationSnapshots,
  payoutApplications,
  sponsorPlanRewards,
  type CompensationObligationKind,
} from "@/db/schema";
import { lockAgentLedgers } from "@/lib/advisory-locks";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type AllocationForObligations = Pick<
  typeof dealCompensationAllocations.$inferSelect,
  | "id"
  | "snapshotId"
  | "agentId"
  | "teamLeaderAgentId"
  | "sponsorAgentId"
  | "agentNet"
  | "teamLeaderAllocation"
  | "sponsorAmount"
>;

export type NewCompensationObligation = {
  snapshotId: number;
  allocationId: number;
  recipientAgentId: number;
  sourceAgentId: number;
  kind: CompensationObligationKind;
  amountCents: number;
};

function dollarsToCents(value: number) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

export function isFullCompensationReceipt(grossCommission: number, amountCents: number) {
  return amountCents >= dollarsToCents(grossCommission);
}

export class IncompleteCompensationReceiptError extends Error {
  readonly requiredCents: number;

  constructor(requiredCents: number) {
    super("The full commission must be received before agent payouts become payable");
    this.name = "IncompleteCompensationReceiptError";
    this.requiredCents = requiredCents;
  }
}

export function obligationsForAllocation(
  allocation: AllocationForObligations,
): NewCompensationObligation[] {
  const candidates: Array<{
    kind: CompensationObligationKind;
    recipientAgentId: number | null;
    amountCents: number;
  }> = [
    {
      kind: "agent_net",
      recipientAgentId: allocation.agentId,
      amountCents: dollarsToCents(allocation.agentNet),
    },
    {
      kind: "team_split",
      recipientAgentId: allocation.teamLeaderAgentId,
      amountCents: dollarsToCents(allocation.teamLeaderAllocation),
    },
    {
      kind: "sponsor_reward",
      recipientAgentId: allocation.sponsorAgentId,
      amountCents: dollarsToCents(allocation.sponsorAmount),
    },
  ];

  return candidates
    .filter(
      (row): row is typeof row & { recipientAgentId: number } =>
        Boolean(row.recipientAgentId && row.amountCents > 0),
    )
    .map((row) => ({
      snapshotId: allocation.snapshotId,
      allocationId: allocation.id,
      recipientAgentId: row.recipientAgentId,
      sourceAgentId: allocation.agentId,
      kind: row.kind,
      amountCents: row.amountCents,
    }));
}

export async function createCompensationObligations(
  tx: DbTransaction,
  snapshotId: number,
) {
  const allocations = await tx
    .select()
    .from(dealCompensationAllocations)
    .where(eq(dealCompensationAllocations.snapshotId, snapshotId));
  const values = allocations.flatMap(obligationsForAllocation);
  if (!values.length) return [];
  const [receipt] = await tx
    .select({ receivedAt: compensationReceipts.receivedAt })
    .from(compensationReceipts)
    .where(eq(compensationReceipts.snapshotId, snapshotId))
    .limit(1);
  const now = new Date().toISOString();
  return tx
    .insert(compensationObligations)
    .values(values.map((row) => ({
      ...row,
      status: receipt ? "payable" as const : "pending_receipt" as const,
      availableAt: receipt?.receivedAt || null,
      createdAt: now,
      updatedAt: now,
    })))
    .onConflictDoNothing()
    .returning();
}

export async function recordCompensationReceipt(
  tx: DbTransaction,
  input: {
    snapshotId: number;
    amountCents: number;
    receivedAt: string;
    method: string;
    reference?: string | null;
    createdByEmail?: string | null;
  },
) {
  const [snapshot] = await tx
    .select({ grossCommission: dealCompensationSnapshots.grossCommission })
    .from(dealCompensationSnapshots)
    .where(eq(dealCompensationSnapshots.id, input.snapshotId))
    .limit(1);
  if (!snapshot) throw new Error("Compensation snapshot not found");
  const requiredCents = dollarsToCents(snapshot.grossCommission);
  if (!isFullCompensationReceipt(snapshot.grossCommission, input.amountCents)) {
    throw new IncompleteCompensationReceiptError(requiredCents);
  }
  const [receipt] = await tx
    .insert(compensationReceipts)
    .values({
      snapshotId: input.snapshotId,
      amountCents: input.amountCents,
      receivedAt: input.receivedAt,
      method: input.method,
      reference: input.reference || null,
      createdByEmail: input.createdByEmail || null,
    })
    .onConflictDoUpdate({
      target: compensationReceipts.snapshotId,
      set: {
        amountCents: input.amountCents,
        receivedAt: input.receivedAt,
        method: input.method,
        reference: input.reference || null,
        createdByEmail: input.createdByEmail || null,
      },
    })
    .returning();
  await tx
    .update(compensationObligations)
    .set({
      status: "payable",
      availableAt: input.receivedAt,
      updatedAt: new Date().toISOString(),
    })
    .where(and(
      eq(compensationObligations.snapshotId, input.snapshotId),
      eq(compensationObligations.status, "pending_receipt"),
    ));
  return receipt;
}

export async function removeCompensationReceipt(tx: DbTransaction, snapshotId: number) {
  const recipients = await tx
    .select({ agentId: compensationObligations.recipientAgentId })
    .from(compensationObligations)
    .where(eq(compensationObligations.snapshotId, snapshotId));
  await lockAgentLedgers(tx, recipients.map((row) => row.agentId));
  const [paid] = await tx
    .select({ id: compensationObligations.id })
    .from(compensationObligations)
    .where(and(
      eq(compensationObligations.snapshotId, snapshotId),
      gt(compensationObligations.paidCents, 0),
    ))
    .limit(1);
  if (paid) return false;
  await tx
    .delete(compensationReceipts)
    .where(eq(compensationReceipts.snapshotId, snapshotId));
  await tx
    .update(compensationObligations)
    .set({
      status: "pending_receipt",
      availableAt: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(compensationObligations.snapshotId, snapshotId));
  return true;
}

export async function applyPayoutToObligations(
  tx: DbTransaction,
  input: { payoutId: number; recipientAgentId: number; amountCents: number },
) {
  await lockAgentLedgers(tx, [input.recipientAgentId]);
  const obligationRows = await tx
    .select()
    .from(compensationObligations)
    .where(and(
      eq(compensationObligations.recipientAgentId, input.recipientAgentId),
      inArray(compensationObligations.status, ["payable", "partially_paid"]),
    ))
    .orderBy(asc(compensationObligations.availableAt), asc(compensationObligations.id));
  const rewardRows = await tx
    .select()
    .from(sponsorPlanRewards)
    .where(and(
      eq(sponsorPlanRewards.sponsorAgentId, input.recipientAgentId),
      inArray(sponsorPlanRewards.status, ["accrued", "partially_paid"]),
    ))
    .orderBy(asc(sponsorPlanRewards.availableAt), asc(sponsorPlanRewards.id));
  const rows = [
    ...obligationRows.map((row) => ({
      target: "obligation" as const,
      id: row.id,
      amountCents: row.amountCents,
      paidCents: row.paidCents,
      availableAt: row.availableAt,
    })),
    ...rewardRows.map((row) => ({
      target: "plan_reward" as const,
      id: row.id,
      amountCents: row.amountCents,
      paidCents: row.paidCents,
      availableAt: row.availableAt || row.earnedAt,
    })),
  ].sort((a, b) => {
    const byDate = String(a.availableAt || "").localeCompare(String(b.availableAt || ""));
    return byDate || a.id - b.id;
  });
  let remaining = input.amountCents;
  const applied: Array<{
    obligationId: number | null;
    sponsorPlanRewardId: number | null;
    amountCents: number;
  }> = [];
  for (const row of rows) {
    if (remaining <= 0) break;
    const outstanding = Math.max(0, row.amountCents - row.paidCents);
    const amountCents = Math.min(remaining, outstanding);
    if (amountCents <= 0) continue;
    applied.push({
      obligationId: row.target === "obligation" ? row.id : null,
      sponsorPlanRewardId: row.target === "plan_reward" ? row.id : null,
      amountCents,
    });
    remaining -= amountCents;
    const paidCents = row.paidCents + amountCents;
    if (row.target === "obligation") {
      await tx
        .update(compensationObligations)
        .set({
          paidCents,
          status: paidCents >= row.amountCents ? "paid" : "partially_paid",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(compensationObligations.id, row.id));
    } else {
      await tx
        .update(sponsorPlanRewards)
        .set({
          paidCents,
          status: paidCents >= row.amountCents ? "paid" : "partially_paid",
        })
        .where(eq(sponsorPlanRewards.id, row.id));
    }
  }
  if (applied.length) {
    await tx.insert(payoutApplications).values(applied.map((row) => ({
      payoutId: input.payoutId,
      obligationId: row.obligationId,
      sponsorPlanRewardId: row.sponsorPlanRewardId,
      amountCents: row.amountCents,
    })));
  }
  return { applied, appliedCents: input.amountCents - remaining, unappliedCents: remaining };
}

export async function reversePayoutApplications(tx: DbTransaction, payoutId: number) {
  const [payout] = await tx
    .select({ agentId: agentPayouts.agentId })
    .from(agentPayouts)
    .where(eq(agentPayouts.id, payoutId))
    .limit(1);
  if (payout) await lockAgentLedgers(tx, [payout.agentId]);
  const applications = await tx
    .select()
    .from(payoutApplications)
    .where(eq(payoutApplications.payoutId, payoutId));
  for (const application of applications) {
    if (application.obligationId) {
      const [obligation] = await tx
        .select()
        .from(compensationObligations)
        .where(eq(compensationObligations.id, application.obligationId))
        .limit(1);
      if (!obligation) continue;
      const paidCents = Math.max(0, obligation.paidCents - application.amountCents);
      await tx
        .update(compensationObligations)
        .set({
          paidCents,
          status: paidCents > 0 ? "partially_paid" : obligation.availableAt ? "payable" : "pending_receipt",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(compensationObligations.id, obligation.id));
    } else if (application.sponsorPlanRewardId) {
      const [reward] = await tx
        .select()
        .from(sponsorPlanRewards)
        .where(eq(sponsorPlanRewards.id, application.sponsorPlanRewardId))
        .limit(1);
      if (!reward) continue;
      const paidCents = Math.max(0, reward.paidCents - application.amountCents);
      await tx
        .update(sponsorPlanRewards)
        .set({
          paidCents,
          status: paidCents > 0 ? "partially_paid" : "accrued",
        })
        .where(eq(sponsorPlanRewards.id, reward.id));
    }
  }
  await tx.delete(payoutApplications).where(eq(payoutApplications.payoutId, payoutId));
}
