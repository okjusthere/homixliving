import assert from "node:assert/strict";
import { dosConfirmed, licenseNumberInput, licenseReleaseInput } from "@/lib/onboarding-license";
import { shouldAutomaticallyActivatePaidOnboarding } from "@/lib/onboarding";
import { onboardingWorkflow } from "@/lib/onboarding-workflow";
import { onboardingTasks } from "@/lib/onboarding-tasks";
import type { Agent } from "@/db/schema";
import { verifiedDosFixture } from "./dos-fixture";

assert.ok(dosConfirmed(verifiedDosFixture));
const historical = { ...verifiedDosFixture, accountStatus: "active" as const, dosConfirmation: {
  ...verifiedDosFixture.dosConfirmation, source: "authorized_legacy_backfill" as const,
  confirmedBy: null, batchId: "synthetic-batch", authorization: "Synthetic historical authorization",
} };
assert.ok(dosConfirmed(historical));
assert.equal(dosConfirmed({ ...historical, accountStatus: "pending" }), false);
assert.equal(dosConfirmed({ ...historical, accountStatus: "inactive" }), false);
assert.equal(dosConfirmed({ ...historical, licenseNumber: "changed" }), false);
assert.equal(dosConfirmed({ ...historical, dosConfirmation: { ...historical.dosConfirmation, authorization: "" } }), false);
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
assert.equal(shouldAutomaticallyActivatePaidOnboarding({ ...subject, dosConfirmation: null }, "stripe"), true);
assert.equal(shouldAutomaticallyActivatePaidOnboarding({ ...subject, dosConfirmation: historical.dosConfirmation }, "stripe"), true);
assert.equal(onboardingWorkflow({ ...subject, dosConfirmation: null }, "stripe").next, "activation");
assert.equal(onboardingWorkflow({ ...subject, dosConfirmation: null, accountStatus: "active" }, "stripe").next, "countersign");
const active = { ...subject, dosConfirmation: null, accountStatus: "active" as const } as Agent;
const records = { contracts: [], receipts: [], grants: [] };
assert.ok(onboardingTasks(active, "stripe", records).tasks.includes("dos"), "DOS remains an actionable task after activation");
assert.ok(onboardingTasks(active, "stripe", records).tasks.includes("countersign"), "Company signature remains a separate task");
assert.equal(onboardingWorkflow({ ...active, agreementCountersignedAt: "2026-09-18", agreementStatus: "completed" }, "stripe").next, "dos");
assert.equal(onboardingTasks({ ...active, ...verifiedDosFixture }, "stripe", records).tasks.includes("dos"), false);
assert.equal(onboardingTasks({ ...active, isAdmin: true }, null, records).tasks.includes("dos"), false, "Independent admin accounts do not need an agent license");
assert.equal(onboardingTasks({ ...active, accountStatus: "inactive" }, null, records).tasks.includes("dos"), false);
for (const status of ["released", "not_released", "unknown", "not_applicable"] as const) {
  const declared = { ...subject, dosConfirmation: null, licenseRelease: { status, previousCompany: "Synthetic Brokerage", note: "Synthetic declaration", licenseNumber: subject.licenseNumber, declaredAt: "2026-09-18" } };
  assert.ok(shouldAutomaticallyActivatePaidOnboarding(declared, "stripe"), status);
  assert.equal(dosConfirmed(declared), false, "Activation never invents DOS proof");
}
for (const change of [
  { onboardingCompletedAt: null }, { agreementAgentSignedAt: null }, { signingRequestId: null },
  { agreementStatus: "voided" as const }, { agreementStatus: "declined" as const },
  { accountStatus: "inactive" as const }, { plan: "team_member" as const },
]) assert.equal(shouldAutomaticallyActivatePaidOnboarding({ ...subject, dosConfirmation: null, ...change }, "stripe"), false);
assert.equal(shouldAutomaticallyActivatePaidOnboarding({ ...subject, dosConfirmation: null }, "offline"), false);
console.log("PASS: release declarations and identity-bound DOS proof; signed Stripe activation without DOS; active-account DOS follow-up and retained signature/profile/team gates");
