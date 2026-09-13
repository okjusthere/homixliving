import type { SigningRequest } from "@/lib/signing-contract";
import type { OnboardingAgreementStatus } from "@/db/schema";

export function hrSigningProgress(request: SigningRequest, now = Date.now()) {
  if (!["onboarding", "team_leader"].includes(request.scenario))
    throw new Error("HR_REQUEST_REQUIRED");
  if (
    !request.parts.length ||
    request.parts.some(
      (part) =>
        part.error ||
        part.operationState === "unknown" ||
        part.operationState === "failed",
    )
  )
    throw new Error("HR_SIGNING_RECONCILIATION_REQUIRED");
  const documents = request.parts.flatMap((part) =>
    part.document ? [part.document] : [],
  );
  const owner = documents.flatMap((document) =>
    document.recipients.filter(
      (r) => r.actor === "owner" && r.role === "SIGNER",
    ),
  );
  const company = documents.flatMap((document) =>
    document.recipients.filter(
      (r) => r.actor === "company" && r.role === "SIGNER",
    ),
  );
  function signedAt(recipients: typeof owner) {
    if (
      !recipients.length ||
      recipients.some(
        (r) =>
          r.signingStatus !== "SIGNED" ||
          !r.signedAt ||
          !Number.isFinite(Date.parse(r.signedAt)),
      )
    )
      return null;
    return recipients
      .map((r) => r.signedAt!)
      .sort((a, b) => Date.parse(a) - Date.parse(b))
      .at(-1)!;
  }
  const allCreated = documents.length === request.parts.length;
  const agentSignedAt = allCreated ? signedAt(owner) : null;
  const companySignedAt = allCreated ? signedAt(company) : null;
  let status: OnboardingAgreementStatus = "sent";
  if (
    request.parts.some((part) => part.operationState === "discarded") ||
    documents.some((d) => d.status === "CANCELLED")
  )
    status = "voided";
  else if (documents.some((d) => d.status === "REJECTED")) status = "declined";
  else if (!allCreated || documents.some((d) => d.status === "DRAFT"))
    status = "preparing";
  else if (
    documents.every((d) => d.status === "COMPLETED" && d.completedAt) &&
    agentSignedAt
  )
    status = "completed";
  else if (
    owner.some(
      (r) =>
        r.signingStatus !== "SIGNED" &&
        r.expiresAt &&
        Date.parse(r.expiresAt) <= now,
    )
  )
    status = "expired";
  // A company recipient's expired link is a company follow-up. It does not
  // undo the applicant's completed signature or fabricate a new contract.
  const companyExpired = company.some(
    (r) =>
      r.signingStatus !== "SIGNED" &&
      r.expiresAt &&
      Date.parse(r.expiresAt) <= now,
  );
  return {
    status,
    agentSignedAt,
    companySignedAt,
    companyExpired,
    completedAt:
      status === "completed"
        ? documents
            .map((d) => d.completedAt!)
            .sort((a, b) => Date.parse(a) - Date.parse(b))
            .at(-1)!
        : null,
  };
}
