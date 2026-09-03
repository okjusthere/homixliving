import assert from "node:assert/strict";
import { onboardingPaymentProduct, soloProUpgradeCreditCents } from "../onboarding";
import { normalizeAgentPlan } from "../agent-plans";
import { LICENSED_COMPANIES } from "../licensed-companies";

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

console.log("onboarding v2 tests passed");
