import assert from "node:assert/strict";
import {
  affiliationContractComplete,
  effectiveAccess,
  verifiedManualContract,
} from "@/lib/onboarding-requirements";
import {
  onboardingAgreementAllowsPayment,
  shouldAutomaticallyActivatePaidOnboarding,
} from "@/lib/onboarding";
import { onboardingWorkflow } from "@/lib/onboarding-workflow";
import type { Agent, VerifiedManualContract } from "@/db/schema";

const manual: VerifiedManualContract = {
  id: "synthetic",
  source: "paper",
  company: "Homix Living Inc.",
  plan: "solo",
  teamTermsConfigId: null,
  legalName: "Test Agent",
  licenseNumber: "TEST123",
  agentSignedAt: "2026-09-10",
  companySignedAt: null,
  verifiedAt: "2026-09-12",
};
const agent = {
  licensedCompanyId: "homix_living",
  dosConfirmation: { legalName: manual.legalName, licenseNumber: manual.licenseNumber,
    companyId: "homix_living", confirmedBy: 1, confirmedAt: "2026-09-16T12:00:00Z" },
  accountStatus: "pending",
  isAdmin: false,
  agreementAgentSignedAt: null,
  agreementStatus: "voided",
  licensedCompany: manual.company,
  plan: "solo",
  legalName: manual.legalName,
  licenseNumber: manual.licenseNumber,
  onboardingManualContract: manual,
  teamTermsConfigId: null,
  onboardingCompletedAt: "2026-09-12",
  paymentStatus: "paid",
} as Agent;
assert.ok(verifiedManualContract(agent));
assert.equal(
  affiliationContractComplete(agent),
  false,
  "Missing company signature still blocks full affiliation completion",
);
assert.equal(
  affiliationContractComplete({
    ...agent,
    onboardingManualContract: { ...manual, companySignedAt: "2026-09-11" },
  }),
  true,
);
assert.equal(
  affiliationContractComplete({
    ...agent,
    licenseNumber: "CHANGED",
    onboardingManualContract: { ...manual, companySignedAt: "2026-09-11" },
  }),
  false,
);
assert.ok(
  onboardingAgreementAllowsPayment(agent),
  "verified paper contract satisfies requirements despite a separately cancelled electronic invitation",
);
assert.equal(
  onboardingAgreementAllowsPayment({
    ...agent,
    onboardingManualContract: null,
  }),
  false,
);
for (const change of [
  { licensedCompany: "Another company" },
  { plan: "solo_pro" as const },
  { licenseNumber: "CHANGED" },
  { legalName: "Another person" },
  { teamTermsConfigId: 99 },
]) {
  assert.equal(
    verifiedManualContract({ ...agent, ...change }),
    null,
    "Changed terms/identity invalidate verification",
  );
}
assert.equal(onboardingWorkflow(agent, "offline").canApprove, true);
assert.equal(
  onboardingWorkflow({ ...agent, accountStatus: "active" }, "offline")
    .countersignPending,
  true,
);
process.env.ONBOARDING_V2_ENFORCED = "1";
assert.equal(shouldAutomaticallyActivatePaidOnboarding(agent, "stripe"), true);
assert.equal(
  shouldAutomaticallyActivatePaidOnboarding(agent, "offline"),
  false,
);
const now = new Date("2026-09-12T15:00:00Z");
const grants = [
  {
    status: "open",
    expiresAt: "2026-09-12 15:00:01+00",
    capabilities: ["training" as const],
  },
];
assert.deepEqual(effectiveAccess(agent, grants, now).capabilities, [
  "training",
]);
assert.equal(
  effectiveAccess(agent, grants, new Date(now.getTime() + 1000)).limited,
  false,
  "expiry is enforced on the request boundary",
);
assert.equal(
  effectiveAccess(agent, [{ ...grants[0], status: "revoked" }], now).limited,
  false,
);
assert.equal(
  effectiveAccess({ ...agent, accountStatus: "inactive" }, grants, now).limited,
  false,
);
assert.equal(
  effectiveAccess(
    { ...agent, accountStatus: "active" },
    grants,
    new Date(now.getTime() + 86400000),
  ).full,
  true,
  "old exception expiry never withdraws normal activation",
);
assert.equal(
  effectiveAccess({ ...agent, isAdmin: true }, grants, now).admin,
  false,
  "pending admin flag is not administrator access",
);
console.log(
  "PASS: manual contract requirements, real electronic facts, scoped access, expiry and activation independence",
);
