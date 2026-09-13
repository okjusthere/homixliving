import assert from "node:assert/strict";
import { hrSigningProgress } from "../signing-hr-projection";
import type { SigningRequest } from "../signing-contract";

const owner = {
  id: 1,
  key: "agent",
  actor: "owner",
  name: "Synthetic agent",
  email: "qa-agent@example.invalid",
  role: "SIGNER",
  signingOrder: 1,
  signingStatus: "SIGNED" as const,
  signedAt: "2026-09-12T12:00:00.000Z",
  expiresAt: null,
  sendStatus: "SENT",
  canSign: false,
};
const company = {
  ...owner,
  id: 2,
  key: "company",
  actor: "company",
  email: "qa-company@example.invalid",
  signingOrder: 2,
  signingStatus: "NOT_SIGNED" as const,
  signedAt: null,
  expiresAt: "2026-09-11T12:00:00.000Z",
};
const base: SigningRequest = {
  id: "294fa78c-ad37-482f-aa32-f544d3ebf9f1",
  title: "Synthetic onboarding",
  scenario: "onboarding",
  ownerAgentId: 1,
  business: { customer: "Synthetic agent", property: "", reference: "qa" },
  category: "waiting",
  createdAt: "2026-09-12T12:00:00Z",
  updatedAt: "2026-09-12T12:00:00Z",
  events: [],
  parts: [
    {
      id: "f514d867-7070-4b8d-a90b-5b840cd59ecd",
      index: 0,
      operationState: "linked",
      error: null,
      canEdit: false,
      lastSyncedAt: "2026-09-12T12:00:00Z",
      document: {
        id: "qa-envelope",
        title: "Synthetic",
        status: "PENDING",
        signingOrder: "SEQUENTIAL",
        updatedAt: "2026-09-12T12:00:00Z",
        completedAt: null,
        expired: true,
        recipients: [owner, company],
        files: [{ id: "qa-file", title: "Synthetic.pdf", order: 0 }],
        completionFilesReady: false,
      },
    },
  ],
};
const now = Date.parse("2026-09-12T13:00:00Z");
let progress = hrSigningProgress(base, now);
assert.equal(progress.agentSignedAt, owner.signedAt);
assert.equal(progress.companySignedAt, null);
assert.equal(progress.companyExpired, true);
assert.equal(
  progress.status,
  "sent",
  "company expiration does not revoke the applicant's signature",
);
assert.equal(progress.completedAt, null);
const cancelled = structuredClone(base);
cancelled.parts[0].document!.status = "CANCELLED";
cancelled.parts[0].document!.completedAt = "2026-09-12T12:30:00Z";
assert.equal(hrSigningProgress(cancelled, now).status, "voided");
assert.equal(
  hrSigningProgress(cancelled, now).completedAt,
  null,
  "upstream cancellation timestamp is not successful completion",
);
const unsigned = structuredClone(base);
unsigned.parts[0].document!.recipients[0] = {
  ...owner,
  signingStatus: "NOT_SIGNED",
  signedAt: null,
  expiresAt: "2026-09-11T12:00:00Z",
};
assert.equal(hrSigningProgress(unsigned, now).status, "expired");
const second = structuredClone(unsigned.parts[0]);
second.id = "582723f8-2403-48e7-949c-fb3a9b0723a8";
second.index = 1;
assert.equal(
  hrSigningProgress({ ...base, parts: [...base.parts, second] }, now)
    .agentSignedAt,
  null,
  "one completed group is not completion of all applicant documents",
);
const missing = structuredClone(base);
missing.parts.push({ ...second, document: null, operationState: "prepared" });
assert.equal(hrSigningProgress(missing, now).agentSignedAt, null);
const stale = structuredClone(base);
stale.parts[0].error = "PROVIDER_UNREACHABLE";
assert.throws(
  () => hrSigningProgress(stale, now),
  /RECONCILIATION_REQUIRED/,
  "do not advance onboarding using an unavailable provider's cached projection",
);
const sealed = structuredClone(base);
sealed.parts[0].document!.recipients[1] = {
  ...company,
  signingStatus: "SIGNED",
  signedAt: "2026-09-12T12:30:00Z",
};
sealed.parts[0].document!.status = "COMPLETED";
sealed.parts[0].document!.completedAt = "2026-09-12T12:31:00Z";
progress = hrSigningProgress(sealed, now);
assert.equal(progress.status, "completed");
assert.equal(progress.companySignedAt, "2026-09-12T12:30:00Z");
assert.equal(progress.completedAt, "2026-09-12T12:31:00Z");
const falseCompletion = structuredClone(sealed);
falseCompletion.parts[0].document!.recipients[0].signedAt = null;
assert.notEqual(
  hrSigningProgress(falseCompletion, now).status,
  "completed",
  "never invent a missing recipient completion time",
);
console.log(
  "PASS: Documenso HR role progress, multi-part completion, expiration, cancellation and stale-data gates",
);
