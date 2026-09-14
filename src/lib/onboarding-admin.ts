import "server-only";
import { nyDate } from "@/lib/celebrations/calendar";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  agents,
  commerceOrders,
  onboardingEvents,
  teamJoinRequests,
} from "@/db/schema";
import {
  onboardingAccessGrants,
  onboardingContracts,
  onboardingExistingStaff,
  onboardingReceipts,
} from "@/db/onboarding-schema";
import {
  lockAgentLedgers,
  lockOnboardingAgent,
  type DbTransaction,
} from "@/lib/advisory-locks";
import { onboardingEventValues } from "@/lib/onboarding-events";
import {
  effectiveAccess,
  LIMITED_CAPABILITIES,
  verifiedManualContract,
} from "@/lib/onboarding-requirements";
import {
  onboardingAgreementAllowsPayment,
  onboardingPaymentProduct,
} from "@/lib/onboarding";
import { getCommerceProduct } from "@/lib/commerce/catalog";
import {
  onboardingLicenseTransferFeeCents,
  settlePlanPayment,
} from "@/lib/plan-payments";

export class OnboardingCommandError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
const reason = z.string().trim().min(5).max(2000);
const day = z.iso
  .date()
  .refine((value) => value <= nyDate(), "Date cannot be in the future");
const identifier = z
  .string()
  .trim()
  .min(8)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);
export const receiptInput = z
  .object({
    agentId: z.number().int().positive(),
    amountCents: z.number().int().positive().max(100_000_000),
    currency: z.literal("usd").default("usd"),
    method: z.enum(["cash", "check", "ach", "zelle", "wire", "other"]),
    reference: z.string().trim().min(3).max(120),
    receivedAt: day,
    idempotencyKey: identifier,
  })
  .strict();
export const adminCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("review_contract"),
    contractId: z.uuid(),
    decision: z.enum(["accept", "return", "revoke"]),
    teamTermsVerified: z.boolean().default(false),
    reason,
  }),
  z.object({
    action: z.literal("grant_access"),
    capabilities: z.array(z.enum(LIMITED_CAPABILITIES)).min(1).max(3),
    expiresAt: z.iso.datetime({ offset: true }),
    reason,
    outstandingRequirements: reason,
    responsibleAgentId: z.number().int().positive(),
  }),
  z.object({ action: z.literal("revoke_access"), grantId: z.uuid(), reason }),
  z.object({
    action: z.literal("existing_staff"),
    contractId: z.uuid(),
    identityAndTermsVerified: z.literal(true),
    billingBasis: z.enum([
      "not_applicable",
      "historically_verified",
      "current_payment",
    ]),
    billingEvidence: reason,
    reason,
  }),
  z.object({ action: z.literal("match_receipt"), receiptId: z.uuid(), reason }),
  z.object({ action: z.literal("void_receipt"), receiptId: z.uuid(), reason }),
  z.object({
    action: z.literal("disposition"),
    disposition: z.enum(["deferred", "closed", "open"]),
    reason,
  }),
]);

async function lockedSubject(
  tx: DbTransaction,
  agentId: number,
  actorId: number,
) {
  await lockAgentLedgers(tx, [agentId]);
  await lockOnboardingAgent(tx, agentId);
  const [actor] = await tx.select().from(agents).where(eq(agents.id, actorId));
  if (!actor?.isAdmin || actor.accountStatus !== "active")
    throw new OnboardingCommandError("Administrator access required", 403);
  const [agent] = await tx
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .for("update");
  if (!agent) throw new OnboardingCommandError("Agent not found", 404);
  return { agent, actor };
}
async function event(
  tx: DbTransaction,
  agentId: number,
  actorId: number,
  eventType: string,
  detail: Record<string, unknown>,
) {
  await tx.insert(onboardingEvents).values(
    onboardingEventValues({
      agentId,
      actorAgentId: actorId,
      eventType,
      detail,
    }),
  );
}
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function recordOnboardingReceipt(actorId: number, input: unknown) {
  const body = receiptInput.parse(input);
  const requestHash = hash(body);
  const referenceKey = hash([
    body.currency,
    body.method,
    body.reference.toLowerCase().replace(/\s+/g, " "),
  ]);
  return db.transaction(async (tx) => {
    await lockedSubject(tx, body.agentId, actorId);
    // Lock both keys across different agents as well as the per-agent ledger.
    for (const key of [body.idempotencyKey, referenceKey].sort())
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`onboarding-receipt:${key}`}, 0))`,
      );
    const [existing] = await tx
      .select()
      .from(onboardingReceipts)
      .where(
        or(
          eq(onboardingReceipts.idempotencyKey, body.idempotencyKey),
          and(
            eq(onboardingReceipts.referenceKey, referenceKey),
            sql`${onboardingReceipts.status} <> 'voided'`,
          ),
        ),
      );
    if (existing) {
      if (existing.requestHash === requestHash)
        return { receipt: existing, replayed: true };
      throw new OnboardingCommandError(
        "This request or payment reference has already been recorded. Review the existing receipt.",
      );
    }
    const [receipt] = await tx
      .insert(onboardingReceipts)
      .values({
        ...body,
        id: randomUUID(),
        requestHash,
        referenceKey,
        recordedBy: actorId,
        receivedAt: `${body.receivedAt}T12:00:00.000Z`,
      })
      .returning();
    await event(tx, body.agentId, actorId, "receipt_recorded", {
      receiptId: receipt.id,
      amountCents: receipt.amountCents,
      method: receipt.method,
      reference: receipt.reference,
    });
    return { receipt, replayed: false };
  });
}

export async function runOnboardingCommand(
  agentId: number,
  actorId: number,
  input: unknown,
) {
  const command = adminCommand.parse(input);
  const result = await db.transaction(async (tx) => {
    const { agent, actor } = await lockedSubject(tx, agentId, actorId);
    const now = new Date().toISOString();
    if (command.action === "review_contract") {
      const [contract] = await tx
        .select()
        .from(onboardingContracts)
        .where(
          and(
            eq(onboardingContracts.id, command.contractId),
            eq(onboardingContracts.agentId, agentId),
          ),
        )
        .for("update");
      if (!contract)
        throw new OnboardingCommandError("Contract not found", 404);
      if (command.decision === "accept") {
        if (!["uploaded", "returned"].includes(contract.status))
          throw new OnboardingCommandError(
            "Only an uploaded or returned version can be verified",
          );
        if (
          contract.company !== agent.licensedCompany ||
          !agent.licenseNumber ||
          !agent.legalName?.trim()
        )
          throw new OnboardingCommandError(
            "Verify the person's identity, licence and matching legal company first",
          );
        if (agent.plan === "team_member") {
          const [pending] = await tx
            .select({ id: teamJoinRequests.id })
            .from(teamJoinRequests)
            .where(
              and(
                eq(teamJoinRequests.agentId, agentId),
                eq(teamJoinRequests.status, "pending"),
              ),
            )
            .limit(1);
          if (
            !command.teamTermsVerified ||
            !agent.teamId ||
            !agent.teamTermsConfigId ||
            pending
          )
            throw new OnboardingCommandError(
              "Verify the selected team compensation terms in the signed file after team approval.",
            );
        }
        const previous = agent.onboardingManualContract?.id;
        if (previous)
          await tx
            .update(onboardingContracts)
            .set({ status: "superseded" })
            .where(
              and(
                eq(onboardingContracts.id, previous),
                eq(onboardingContracts.agentId, agentId),
              ),
            );
        await tx
          .update(agents)
          .set({
            onboardingManualContract: {
              id: contract.id,
              source: contract.source,
              company: contract.company,
              plan: agent.plan,
              teamTermsConfigId: agent.teamTermsConfigId,
              legalName: agent.legalName!,
              licenseNumber: agent.licenseNumber,
              agentSignedAt: contract.agentSignedAt,
              companySignedAt: contract.companySignedAt,
              verifiedAt: now,
            },
            ...(agent.plan === "team_member"
              ? { teamTermsAcceptedAt: contract.agentSignedAt }
              : {}),
            updatedAt: now,
          })
          .where(eq(agents.id, agentId));
      } else {
        if (command.decision === "revoke" && contract.status !== "accepted")
          throw new OnboardingCommandError(
            "Only the accepted version can be revoked",
          );
        if (
          command.decision === "return" &&
          !["uploaded", "returned"].includes(contract.status)
        )
          throw new OnboardingCommandError(
            "Revoke an accepted contract instead of returning it",
          );
        if (agent.onboardingManualContract?.id === contract.id)
          await tx
            .update(agents)
            .set({ onboardingManualContract: null, updatedAt: now })
            .where(eq(agents.id, agentId));
      }
      await tx
        .update(onboardingContracts)
        .set({
          status:
            command.decision === "accept"
              ? "accepted"
              : command.decision === "return"
                ? "returned"
                : "revoked",
          reviewedBy: actorId,
          reviewedAt: now,
          reviewReason: command.reason,
        })
        .where(eq(onboardingContracts.id, contract.id));
    } else if (command.action === "grant_access") {
      if (agent.accountStatus !== "pending")
        throw new OnboardingCommandError(
          "Limited access is only available for pending agents",
        );
      const expiry = Date.parse(command.expiresAt);
      if (expiry <= Date.now() || expiry > Date.now() + 90 * 86400000)
        throw new OnboardingCommandError(
          "Select a deadline within the next 90 days",
          400,
        );
      const [responsible] = await tx
        .select()
        .from(agents)
        .where(eq(agents.id, command.responsibleAgentId));
      if (!responsible?.isAdmin || responsible.accountStatus !== "active")
        throw new OnboardingCommandError(
          "Select an active administrator responsible for completion",
          400,
        );
      await tx
        .update(onboardingAccessGrants)
        .set({ status: "revoked", endedBy: actorId, endedAt: now })
        .where(
          and(
            eq(onboardingAccessGrants.agentId, agentId),
            eq(onboardingAccessGrants.status, "open"),
          ),
        );
      await tx.insert(onboardingAccessGrants).values({
        id: randomUUID(),
        agentId,
        capabilities: [...new Set(command.capabilities)],
        reason: command.reason,
        outstandingRequirements: command.outstandingRequirements,
        responsibleAgentId: command.responsibleAgentId,
        expiresAt: command.expiresAt,
        grantedBy: actorId,
      });
    } else if (command.action === "revoke_access") {
      const rows = await tx
        .update(onboardingAccessGrants)
        .set({ status: "revoked", endedBy: actorId, endedAt: now })
        .where(
          and(
            eq(onboardingAccessGrants.id, command.grantId),
            eq(onboardingAccessGrants.agentId, agentId),
            eq(onboardingAccessGrants.status, "open"),
          ),
        )
        .returning();
      if (!rows.length)
        throw new OnboardingCommandError("The grant is no longer open");
    } else if (command.action === "existing_staff") {
      const manual = verifiedManualContract(agent);
      if (
        agent.accountStatus !== "pending" ||
        !manual ||
        manual.source !== "historic" ||
        manual.id !== command.contractId
      )
        throw new OnboardingCommandError(
          "Verify the current historical contract before recognizing existing staff",
        );
      if (!agent.onboardingCompletedAt)
        throw new OnboardingCommandError("Complete the person's profile first");
      const [pendingTeam] = await tx
        .select()
        .from(teamJoinRequests)
        .where(
          and(
            eq(teamJoinRequests.agentId, agentId),
            eq(teamJoinRequests.status, "pending"),
          ),
        );
      if (
        pendingTeam ||
        (agent.plan === "team_member" &&
          (!agent.teamId ||
            !agent.teamTermsConfigId ||
            !agent.teamTermsAcceptedAt))
      )
        throw new OnboardingCommandError(
          "Confirm team membership and compensation terms first",
        );
      if (
        command.billingBasis === "current_payment" &&
        agent.paymentStatus !== "paid"
      )
        throw new OnboardingCommandError("Match the current fee payment first");
      await tx.insert(onboardingExistingStaff).values({
        id: randomUUID(),
        agentId,
        contractId: manual.id,
        reason: command.reason,
        billingBasis: command.billingBasis,
        billingEvidence: command.billingEvidence,
        recognizedBy: actorId,
      });
      await tx
        .update(agents)
        .set({
          accountStatus: "active",
          onboardingStage: "complete",
          onboardingDisposition: null,
          ...(command.billingBasis === "not_applicable" &&
          agent.paymentStatus !== "paid"
            ? { paymentStatus: "not_required" as const }
            : {}),
          updatedAt: now,
        })
        .where(eq(agents.id, agentId));
      await tx
        .update(onboardingAccessGrants)
        .set({ status: "completed", endedBy: actorId, endedAt: now })
        .where(
          and(
            eq(onboardingAccessGrants.agentId, agentId),
            eq(onboardingAccessGrants.status, "open"),
          ),
        );
    } else if (
      command.action === "match_receipt" ||
      command.action === "void_receipt"
    ) {
      const [receipt] = await tx
        .select()
        .from(onboardingReceipts)
        .where(
          and(
            eq(onboardingReceipts.id, command.receiptId),
            eq(onboardingReceipts.agentId, agentId),
          ),
        )
        .for("update");
      if (!receipt) throw new OnboardingCommandError("Receipt not found", 404);
      if (command.action === "match_receipt" && receipt.status === "matched")
        return { success: true, replayed: true };
      if (receipt.status !== "unmatched")
        throw new OnboardingCommandError(
          "Only an unmatched receipt can be processed. Settled payments require the finance adjustment workflow.",
        );
      if (command.action === "void_receipt") {
        await tx
          .update(onboardingReceipts)
          .set({ status: "voided", reason: command.reason })
          .where(eq(onboardingReceipts.id, receipt.id));
      } else {
        const [pendingTeam] = await tx
          .select()
          .from(teamJoinRequests)
          .where(
            and(
              eq(teamJoinRequests.agentId, agentId),
              eq(teamJoinRequests.status, "pending"),
            ),
          );
        if (
          agent.accountStatus !== "pending" ||
          !agent.onboardingCompletedAt ||
          !onboardingAgreementAllowsPayment(agent) ||
          pendingTeam ||
          (agent.plan === "team_member" &&
            (!agent.teamId ||
              !agent.teamTermsConfigId ||
              !agent.teamTermsAcceptedAt))
        )
          throw new OnboardingCommandError(
            "The receipt is saved. Complete the profile, contract and team terms before matching the onboarding fee.",
          );
        const [paidOrder] = await tx
          .select({ id: commerceOrders.id })
          .from(commerceOrders)
          .where(
            and(
              eq(commerceOrders.agentId, agentId),
              inArray(commerceOrders.status, ["paid", "active"]),
              sql`${commerceOrders.licenseTransferFeeCents} > 0`,
            ),
          );
        if (agent.paymentStatus === "paid" || paidOrder)
          throw new OnboardingCommandError(
            "The fee is already paid. Keep this additional receipt unmatched for finance reconciliation.",
          );
        const key = onboardingPaymentProduct(
          agent.plan,
          agent.affiliationTermMonths,
        );
        const product = key && getCommerceProduct(key);
        if (!product)
          throw new OnboardingCommandError(
            "Select the applicable payment plan first",
          );
        const transferFee = onboardingLicenseTransferFeeCents(
          agent,
          product.key,
        );
        if (receipt.amountCents !== product.amountCents + transferFee)
          throw new OnboardingCommandError(
            `Receipt amount differs from the required fee (${product.amountCents + transferFee} cents). Keep it unmatched for reconciliation.`,
          );
        const [order] = await tx
          .insert(commerceOrders)
          .values({
            agentId,
            productKey: product.key,
            productName: product.name,
            billingMode: product.billingMode,
            amountCents: receipt.amountCents,
            licenseTransferFeeCents: transferFee,
            currency: receipt.currency,
            status: "paid",
            paymentChannel: "offline",
            offlineMethod: receipt.method,
            offlineReference: receipt.reference,
            verifiedByEmail: actor.email,
            externalPaymentKey: `receipt:${receipt.id}`,
            customerName: agent.legalName || agent.name,
            customerEmail: agent.email,
            referralHasAgent: agent.referredByAgentId ? "yes" : "no",
            workspaceStatus: "not_required",
            paidAt: receipt.receivedAt,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        await settlePlanPayment(tx, {
          order,
          sourceKey: `receipt:${receipt.id}`,
          amountCents: receipt.amountCents,
          rewardEligibleAmountCents: product.amountCents,
          earnedAt: receipt.receivedAt,
        });
        await tx
          .update(onboardingReceipts)
          .set({
            status: "matched",
            orderId: order.id,
            matchedAt: now,
            reason: command.reason,
          })
          .where(eq(onboardingReceipts.id, receipt.id));
      }
    } else if (command.action === "disposition") {
      await tx
        .update(agents)
        .set({
          onboardingDisposition:
            command.disposition === "open"
              ? null
              : {
                  status: command.disposition,
                  reason: command.reason,
                  at: now,
                  actorId,
                },
          updatedAt: now,
        })
        .where(eq(agents.id, agentId));
    }
    await event(tx, agentId, actorId, command.action, command);
    return { success: true, replayed: false };
  });
  if (command.action === "review_contract" && command.decision === "accept") {
    // The verification commits first; a retryable team transition must not undo its receipt.
    const [subject] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId));
    if (subject?.plan === "team_member") {
      const { activateFormingTeamAfterMemberAgreement } =
        await import("@/lib/team-leader-agreement");
      await activateFormingTeamAfterMemberAgreement({
        teamId: subject.teamId,
        memberAgentId: agentId,
      }).catch(() =>
        console.error(
          "Team activation after manual contract verification will retry on reconciliation",
        ),
      );
    }
  }
  return result;
}

export async function onboardingAdminRecords(agentId: number) {
  const [contracts, receipts, grants, recognition] = await Promise.all([
    db
      .select()
      .from(onboardingContracts)
      .where(eq(onboardingContracts.agentId, agentId))
      .orderBy(desc(onboardingContracts.createdAt)),
    db
      .select()
      .from(onboardingReceipts)
      .where(eq(onboardingReceipts.agentId, agentId))
      .orderBy(desc(onboardingReceipts.createdAt)),
    db
      .select()
      .from(onboardingAccessGrants)
      .where(eq(onboardingAccessGrants.agentId, agentId))
      .orderBy(desc(onboardingAccessGrants.createdAt)),
    db
      .select()
      .from(onboardingExistingStaff)
      .where(eq(onboardingExistingStaff.agentId, agentId)),
  ]);
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
  return {
    contracts: contracts.map(({ objectKey, ...contract }) => {
      void objectKey;
      return contract;
    }),
    receipts,
    grants,
    recognition: recognition[0] || null,
    signingClosure: agent?.onboardingSigningClosure || null,
    signingRequestId: agent?.signingRequestId || null,
    agreementStatus: agent?.agreementStatus || "not_started",
    access: agent ? effectiveAccess(agent, grants) : null,
  };
}
