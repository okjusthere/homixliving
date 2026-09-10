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
import { onboardingEnvelopeSignatureProgress } from "../onboarding-agreement";
import type { ESignEnvelope } from "../esign";

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

const signatureProgress = onboardingEnvelopeSignatureProgress({
  id: "env_1",
  templateId: "tpl_1",
  templateVersionId: "ver_1",
  status: "IN_PROGRESS",
  recipients: [
    {
      id: "recipient_agent",
      roleId: "role_agent",
      name: "Agent Test",
      email: "agent@example.com",
      kind: "signer",
      status: "COMPLETED",
      completedAt: "2026-09-10T12:05:00.000Z",
    },
    {
      id: "recipient_broker",
      roleId: "role_broker",
      name: "Broker Test",
      email: "hr@example.com",
      kind: "countersigner",
      status: "ACTIVE",
    },
  ],
} as ESignEnvelope);
assert.equal(signatureProgress.agentSignedAt, "2026-09-10T12:05:00.000Z");
assert.equal(signatureProgress.countersignedAt, null);

console.log("onboarding v2 tests passed");
