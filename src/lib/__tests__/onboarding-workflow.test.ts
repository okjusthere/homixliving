import assert from "node:assert/strict";
import { verifiedDosFixture } from "./dos-fixture";
import { onboardingWorkflow } from "@/lib/onboarding-workflow";
type Subject = Parameters<typeof onboardingWorkflow>[0];
const agent: Subject = {
  ...verifiedDosFixture,
  accountStatus: "pending",
  onboardingCompletedAt: "2026-09-12",
  agreementAgentSignedAt: null,
  agreementCountersignedAt: null,
  agreementStatus: "sent",
  signingRequestId: "00000000-0000-4000-8000-000000000001",
  paymentStatus: "pending",
  plan: "solo",
  teamId: null,
  teamTermsConfigId: null,
  teamTermsAcceptedAt: null,
};
assert.equal(onboardingWorkflow(agent, null).next, "signature");
assert.equal(onboardingWorkflow(agent, null).canApprove, false);
const signed = { ...agent, agreementAgentSignedAt: "2026-09-12" };
assert.equal(onboardingWorkflow(signed, null).canRecordPayment, true);
const paid = { ...signed, paymentStatus: "paid" as const };
assert.equal(onboardingWorkflow(paid, "offline").canApprove, true);
assert.equal(onboardingWorkflow(paid, "stripe").canApprove, true);
assert.equal(onboardingWorkflow(paid, "stripe").next, "activation");
assert.equal(onboardingWorkflow({ ...paid, dosConfirmation: null }, "stripe").next, "activation");
assert.equal(onboardingWorkflow({ ...paid, dosConfirmation: null }, "offline").canComplete, true);
assert.equal(onboardingWorkflow({ ...signed, dosConfirmation: null }, null).next, "payment");
assert.equal(onboardingWorkflow(paid, null).next, "payment_issue");
assert.equal(onboardingWorkflow(paid, "offline", true).canApprove, false);
for (const agreementStatus of [
  "declined",
  "expired",
  "voided",
  "failed",
] as const) {
  const result = onboardingWorkflow({ ...paid, agreementStatus }, "offline");
  assert.equal(result.canApprove, false, agreementStatus);
  assert.equal(result.canRecordPayment, true, agreementStatus);
  assert.equal(result.next, "agreement_issue");
}
assert.equal(
  onboardingWorkflow({ ...paid, plan: "team_member" }, "offline").canApprove,
  false,
);
assert.equal(
  onboardingWorkflow({ ...paid, onboardingCompletedAt: null }, "offline").next,
  "profile",
);
const active = onboardingWorkflow(
  { ...paid, accountStatus: "active" },
  "stripe",
);
assert.equal(active.countersignPending, true);
assert.equal(active.next, "countersign");
assert.equal(active.canApprove, false);
assert.equal(
  onboardingWorkflow(
    {
      ...paid,
      accountStatus: "active",
      agreementCountersignedAt: "2026-09-12",
      agreementStatus: "completed",
    },
    "stripe",
  ).next,
  "complete",
);
console.log(
  "PASS: online automatic vs offline approval, complete eligibility, ended agreements, team gates, and countersign tasks after activation",
);
