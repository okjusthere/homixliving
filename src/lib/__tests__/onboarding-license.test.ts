import assert from "node:assert/strict";
import { dosConfirmed, licenseNumberInput, licenseReleaseInput } from "@/lib/onboarding-license";
import { shouldAutomaticallyActivatePaidOnboarding } from "@/lib/onboarding";
import { onboardingWorkflow } from "@/lib/onboarding-workflow";
import { verifiedDosFixture } from "./dos-fixture";

assert.ok(dosConfirmed(verifiedDosFixture));
for (const change of [{ dosConfirmation: null }, { legalName: "Other Person" }, { licenseNumber: "Other" },
  { licensedCompanyId: "homix_living" as const }, { licenseNumber: "" },
  { dosConfirmation: { ...verifiedDosFixture.dosConfirmation, confirmedBy: 0 } }])
  assert.equal(dosConfirmed({ ...verifiedDosFixture, ...change }), false);
assert.equal(licenseNumberInput.safeParse(" ").success, false);
assert.equal(licenseReleaseInput.safeParse({ status: "not_applicable", previousCompany: "", note: "" }).success, false);
for (const status of ["released", "not_released", "unknown", "not_applicable"]) {
  const body = { status, previousCompany: "Synthetic Brokerage", note: "First license" };
  assert.ok(licenseReleaseInput.safeParse(body).success);
  assert.equal(licenseReleaseInput.safeParse({ ...body, confirmedBy: 1 }).success, false);
}
const subject = {
  ...verifiedDosFixture, accountStatus: "pending" as const, plan: "solo" as const,
  onboardingCompletedAt: "2026-09-16", agreementAgentSignedAt: "2026-09-16", agreementCountersignedAt: null,
  agreementStatus: "sent" as const, signingRequestId: "synthetic", paymentStatus: "paid" as const,
  teamId: null, teamTermsConfigId: null, teamTermsAcceptedAt: null,
};
process.env.ONBOARDING_V2_ENFORCED = "1";
assert.ok(shouldAutomaticallyActivatePaidOnboarding(subject, "stripe"));
assert.equal(shouldAutomaticallyActivatePaidOnboarding({ ...subject, dosConfirmation: null }, "stripe"), false);
assert.equal(onboardingWorkflow({ ...subject, dosConfirmation: null }, "stripe").next, "dos");
assert.equal(onboardingWorkflow({ ...subject, dosConfirmation: null, accountStatus: "active" }, "stripe").next, "countersign");
console.log("PASS: release validation, DOS identity-bound proof, Stripe activation gate and active-account grandfathering");
