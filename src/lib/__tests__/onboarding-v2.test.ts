import assert from "node:assert/strict";
import type { Agent } from "@/db/schema";
import {
  onboardingAgreementAllowsPayment,
  onboardingPaymentProduct,
  shouldAutomaticallyActivatePaidOnboarding,
  soloProUpgradeCreditCents,
} from "../onboarding";
import { normalizeAgentPlan } from "../agent-plans";
import { LICENSED_COMPANIES } from "../licensed-companies";
import { hrSigningProgress } from "../signing-hr-projection";
import type { SigningRequest } from "../signing-contract";

assert.equal(onboardingPaymentProduct("solo", 12), "one_year_membership");
assert.equal(onboardingPaymentProduct("solo", 24), "two_year_membership");
assert.equal(onboardingPaymentProduct("team_member", 12), "one_year_membership");
assert.equal(onboardingPaymentProduct("solo_pro", 12), "elite_desk_fee");
assert.equal(onboardingPaymentProduct("team_leader", 12), "elite_desk_fee");
assert.equal(normalizeAgentPlan("holding"), "solo");
assert.deepEqual(
  LICENSED_COMPANIES.map((company) => company.brokerEmail),
  ["hr@homixny.com", "hr@homixny.com"],
);

const now = new Date("2026-08-15T12:00:00.000Z");
assert.equal(soloProUpgradeCreditCents({
  currentPlan: "solo",
  priorProductKey: "one_year_membership",
  priorAmountCents: 28_800,
  priorPaidAt: "2026-06-01T12:00:00.000Z",
  now,
}), 28_800);
assert.equal(soloProUpgradeCreditCents({
  currentPlan: "solo",
  priorProductKey: "one_year_membership",
  priorAmountCents: 28_800,
  priorPaidAt: "2026-05-01T12:00:00.000Z",
  now,
}), 0);
assert.equal(soloProUpgradeCreditCents({
  currentPlan: "team_member",
  priorProductKey: "one_year_membership",
  priorAmountCents: 28_800,
  priorPaidAt: "2026-08-01T12:00:00.000Z",
  now,
}), 0);

function onboardingAgent(overrides: Partial<Agent> = {}) {
  return {
    accountStatus: "pending",
    signingRequestId: "00000000-0000-4000-8000-000000000001",
    onboardingCompletedAt: "2026-09-10T12:00:00.000Z",
    agreementAgentSignedAt: "2026-09-10T12:05:00.000Z",
    agreementStatus: "sent",
    plan: "solo",
    teamId: null,
    teamTermsConfigId: null,
    teamTermsAcceptedAt: null,
    ...overrides,
  } as Agent;
}

assert.equal(onboardingAgreementAllowsPayment(onboardingAgent()), true);
assert.equal(onboardingAgreementAllowsPayment(onboardingAgent({ signingRequestId: null })), false, "Retired native tasks cannot activate pending accounts");
assert.equal(onboardingAgreementAllowsPayment(onboardingAgent({ agreementAgentSignedAt: null })), false);
assert.equal(onboardingAgreementAllowsPayment(onboardingAgent({ agreementStatus: "declined" })), false);
const originalEnforcementFlag = process.env.ONBOARDING_V2_ENFORCED;
process.env.ONBOARDING_V2_ENFORCED = "1";
assert.equal(
  shouldAutomaticallyActivatePaidOnboarding(onboardingAgent(), "stripe"),
  true,
);
assert.equal(
  shouldAutomaticallyActivatePaidOnboarding(onboardingAgent(), "offline"),
  false,
);
assert.equal(
  shouldAutomaticallyActivatePaidOnboarding(
    onboardingAgent({ agreementAgentSignedAt: null }),
    "stripe",
  ),
  false,
);
assert.equal(
  shouldAutomaticallyActivatePaidOnboarding(
    onboardingAgent({
      plan: "team_member",
      teamId: 8,
      teamTermsConfigId: null,
      teamTermsAcceptedAt: null,
    }),
    "stripe",
  ),
  false,
);
assert.equal(
  shouldAutomaticallyActivatePaidOnboarding(
    onboardingAgent({
      plan: "team_member",
      teamId: 8,
      teamTermsConfigId: 12,
      teamTermsAcceptedAt: "2026-09-10T12:05:00.000Z",
    }),
    "stripe",
  ),
  true,
);
process.env.ONBOARDING_V2_ENFORCED = "0";
assert.equal(
  shouldAutomaticallyActivatePaidOnboarding(onboardingAgent(), "stripe"),
  false,
);
if (originalEnforcementFlag === undefined) {
  delete process.env.ONBOARDING_V2_ENFORCED;
} else {
  process.env.ONBOARDING_V2_ENFORCED = originalEnforcementFlag;
}

const signatureProgress = hrSigningProgress({ scenario: "onboarding", parts: [{ operationState: "linked", error: null, document: { status: "PENDING", recipients: [
  { actor: "owner", role: "SIGNER", signingStatus: "SIGNED", signedAt: "2026-09-10T12:05:00.000Z" },
  { actor: "company", role: "SIGNER", signingStatus: "NOT_SIGNED", signedAt: null },
] } }] } as SigningRequest);
assert.equal(signatureProgress.agentSignedAt, "2026-09-10T12:05:00.000Z");
assert.equal(signatureProgress.companySignedAt, null);

console.log("onboarding v2 tests passed");
