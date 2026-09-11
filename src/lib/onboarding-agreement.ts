import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import {
  getESignEnvelope,
  esignEnvelopeHasExpired,
  getESignEvidence,
  isOnboardingESignConfigured,
  onboardingESignTemplateConfiguration,
  type ESignEnvelope,
} from "@/lib/esign";
import { onboardingPaymentProduct } from "@/lib/onboarding";
import { activateFormingTeamAfterMemberAgreement } from "@/lib/team-leader-agreement";

export function onboardingAgreementState(status: ESignEnvelope["status"]) {
  if (status === "DRAFT" || status === "PREPARED" || status === "READY_TO_SEND") {
    return "preparing" as const;
  }
  if (status === "COMPLETED") return "completed" as const;
  if (status === "DECLINED") return "declined" as const;
  if (status === "VOIDED") return "voided" as const;
  if (status === "EXPIRED") return "expired" as const;
  if (status === "FAILED_FINALIZATION") return "failed" as const;
  return "sent" as const;
}

function completedRecipientTimestamp(
  recipients: NonNullable<ESignEnvelope["recipients"]>,
  fallback?: string,
) {
  if (recipients.length === 0) return fallback || null;
  if (recipients.some((recipient) => recipient.status !== "COMPLETED")) {
    return null;
  }
  const timestamps = recipients
    .map((recipient) => recipient.completedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  return timestamps.at(-1) || fallback || null;
}

export function onboardingEnvelopeSignatureProgress(envelope: ESignEnvelope) {
  const recipients = envelope.recipients || [];
  const signers = recipients.filter((recipient) => recipient.kind === "signer");
  const countersigners = recipients.filter((recipient) => recipient.kind === "countersigner");
  const completedFallback = envelope.status === "COMPLETED" ? envelope.completedAt : undefined;
  return {
    agentSignedAt: completedRecipientTimestamp(signers, completedFallback),
    countersignedAt: completedRecipientTimestamp(countersigners, completedFallback),
  };
}

export async function syncOnboardingAgreement(agent: typeof agents.$inferSelect) {
  if (!agent.esignEnvelopeId) return agent;
  if (!isOnboardingESignConfigured(
    agent.licensedCompany,
    agent.plan,
    agent.liborMembershipStatus,
  )) {
    throw new Error("The licensed company does not have a configured onboarding agreement.");
  }
  const templateConfiguration = onboardingESignTemplateConfiguration(
    agent.licensedCompany,
    agent.plan,
    agent.liborMembershipStatus,
  );
  if (!templateConfiguration) {
    throw new Error("The licensed company does not have an approved onboarding agreement.");
  }
  const envelope = await getESignEnvelope(agent.esignEnvelopeId);
  if (envelope.templateVersionId !== templateConfiguration.templateVersionId) {
    throw new Error("The onboarding envelope uses an unapproved template version.");
  }
  const status = esignEnvelopeHasExpired(envelope) ? "expired" : onboardingAgreementState(envelope.status);
  const signatures = onboardingEnvelopeSignatureProgress(envelope);
  const agentSignedAt = signatures.agentSignedAt || agent.agreementAgentSignedAt;
  const countersignedAt = signatures.countersignedAt || agent.agreementCountersignedAt;
  const paymentRequired = onboardingPaymentProduct(agent.plan, agent.affiliationTermMonths);
  const signatureCanAdvance = agentSignedAt && ![
    "declined",
    "voided",
    "expired",
    "failed",
  ].includes(status);
  const onboardingStage = agent.accountStatus === "active"
    ? "complete"
    : signatureCanAdvance
      ? paymentRequired && agent.paymentStatus !== "paid" ? "payment" : "review"
      : "agreement";
  let evidencePackageId = agent.esignEvidencePackageId;
  if (status === "completed") {
    const evidence = await getESignEvidence(envelope.id);
    if (evidence.verificationStatus !== "VERIFIED") {
      throw new Error("The onboarding evidence package could not be verified.");
    }
    if (envelope.evidencePackageId && envelope.evidencePackageId !== evidence.id) {
      throw new Error("The onboarding evidence package does not match the completed envelope.");
    }
    evidencePackageId = evidence.id;
  }
  const completedAt = status === "completed"
    ? envelope.completedAt || agent.agreementCompletedAt || new Date().toISOString()
    : agent.agreementCompletedAt;
  const teamTermsAcceptedAt = agentSignedAt && agent.teamTermsConfigId
    ? agentSignedAt
    : agent.teamTermsAcceptedAt;
  if (
    status === agent.agreementStatus &&
    onboardingStage === agent.onboardingStage &&
    envelope.templateVersionId === agent.esignTemplateVersionId &&
    evidencePackageId === agent.esignEvidencePackageId &&
    agentSignedAt === agent.agreementAgentSignedAt &&
    countersignedAt === agent.agreementCountersignedAt &&
    completedAt === agent.agreementCompletedAt &&
    teamTermsAcceptedAt === agent.teamTermsAcceptedAt
  ) {
    if (agent.plan === "team_member" && agent.agreementStatus === "completed") {
      await activateFormingTeamAfterMemberAgreement({
        teamId: agent.teamId,
        memberAgentId: agent.id,
        memberAgreementStatus: agent.agreementStatus,
      });
    }
    const [fresh] = await db.select().from(agents).where(eq(agents.id, agent.id)).limit(1);
    return fresh || agent;
  }
  const [updated] = await db.update(agents).set({
    agreementStatus: status,
    onboardingStage,
    esignTemplateVersionId: envelope.templateVersionId,
    esignEvidencePackageId: evidencePackageId || null,
    agreementAgentSignedAt: agentSignedAt || null,
    agreementCountersignedAt: countersignedAt || null,
    agreementCompletedAt: completedAt || null,
    teamTermsAcceptedAt: teamTermsAcceptedAt || null,
    updatedAt: new Date().toISOString(),
  }).where(and(
    eq(agents.id, agent.id), eq(agents.esignEnvelopeId, agent.esignEnvelopeId),
    eq(agents.agreementStatus, agent.agreementStatus),
    sql`${agents.updatedAt} IS NOT DISTINCT FROM ${agent.updatedAt}::timestamptz`,
  )).returning();
  const result = updated || (await db.select().from(agents).where(eq(agents.id, agent.id)).limit(1))[0] || agent;
  if (result.plan === "team_member" && result.agreementStatus === "completed") {
    await activateFormingTeamAfterMemberAgreement({
      teamId: result.teamId,
      memberAgentId: result.id,
      memberAgreementStatus: result.agreementStatus,
    });
  }
  return result;
}
