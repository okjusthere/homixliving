import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import {
  getESignEnvelope,
  getESignEvidence,
  isOnboardingESignConfigured,
  type ESignEnvelope,
} from "@/lib/esign";
import { onboardingPaymentProduct } from "@/lib/onboarding";

export function onboardingAgreementState(status: ESignEnvelope["status"]) {
  if (status === "DRAFT" || status === "PREPARED" || status === "READY_TO_SEND") {
    return "not_started" as const;
  }
  if (status === "COMPLETED") return "completed" as const;
  if (status === "DECLINED") return "declined" as const;
  if (status === "VOIDED") return "voided" as const;
  if (status === "EXPIRED") return "expired" as const;
  if (status === "FAILED_FINALIZATION") return "failed" as const;
  return "sent" as const;
}

export async function syncOnboardingAgreement(agent: typeof agents.$inferSelect) {
  if (!agent.esignEnvelopeId || !isOnboardingESignConfigured()) return agent;
  const envelope = await getESignEnvelope(agent.esignEnvelopeId);
  const status = onboardingAgreementState(envelope.status);
  const paymentRequired = onboardingPaymentProduct(agent.plan, agent.affiliationTermMonths);
  const onboardingStage = status === "completed"
    ? paymentRequired && agent.paymentStatus !== "paid" ? "payment" : "review"
    : "agreement";
  let evidencePackageId = envelope.evidencePackageId || agent.esignEvidencePackageId;
  if (status === "completed" && !evidencePackageId) {
    const evidence = await getESignEvidence(envelope.id);
    evidencePackageId = evidence.id;
  }
  const completedAt = status === "completed"
    ? envelope.completedAt || agent.agreementCompletedAt || new Date().toISOString()
    : agent.agreementCompletedAt;
  const teamTermsAcceptedAt = status === "completed" && agent.teamTermsConfigId
    ? completedAt
    : agent.teamTermsAcceptedAt;
  if (
    status === agent.agreementStatus &&
    onboardingStage === agent.onboardingStage &&
    envelope.templateVersionId === agent.esignTemplateVersionId &&
    evidencePackageId === agent.esignEvidencePackageId &&
    completedAt === agent.agreementCompletedAt &&
    teamTermsAcceptedAt === agent.teamTermsAcceptedAt
  ) {
    return agent;
  }
  const [updated] = await db.update(agents).set({
    agreementStatus: status,
    onboardingStage,
    esignTemplateVersionId: envelope.templateVersionId,
    esignEvidencePackageId: evidencePackageId || null,
    agreementCompletedAt: completedAt || null,
    teamTermsAcceptedAt: teamTermsAcceptedAt || null,
    updatedAt: new Date().toISOString(),
  }).where(eq(agents.id, agent.id)).returning();
  return updated || agent;
}
