import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  compensationObligations,
  compensationReceipts,
  dealCompensationAllocations,
  payoutApplications,
  type CompensationObligationKind,
} from "@/db/schema";

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
  const rows = await tx
    .select()
    .from(compensationObligations)
    .where(and(
      eq(compensationObligations.recipientAgentId, input.recipientAgentId),
      inArray(compensationObligations.status, ["payable", "partially_paid"]),
    ))
    .orderBy(asc(compensationObligations.availableAt), asc(compensationObligations.id));
  let remaining = input.amountCents;
  const applied: Array<{ obligationId: number; amountCents: number }> = [];
  for (const row of rows) {
    if (remaining <= 0) break;
    const outstanding = Math.max(0, row.amountCents - row.paidCents);
    const amountCents = Math.min(remaining, outstanding);
    if (amountCents <= 0) continue;
    applied.push({ obligationId: row.id, amountCents });
    remaining -= amountCents;
    const paidCents = row.paidCents + amountCents;
    await tx
      .update(compensationObligations)
      .set({
        paidCents,
        status: paidCents >= row.amountCents ? "paid" : "partially_paid",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(compensationObligations.id, row.id));
  }
  if (applied.length) {
    await tx.insert(payoutApplications).values(applied.map((row) => ({
      payoutId: input.payoutId,
      obligationId: row.obligationId,
      amountCents: row.amountCents,
    })));
  }
  return { applied, appliedCents: input.amountCents - remaining, unappliedCents: remaining };
}

export async function reversePayoutApplications(tx: DbTransaction, payoutId: number) {
  const applications = await tx
    .select()
    .from(payoutApplications)
    .where(eq(payoutApplications.payoutId, payoutId));
  for (const application of applications) {
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
  }
  await tx.delete(payoutApplications).where(eq(payoutApplications.payoutId, payoutId));
}
