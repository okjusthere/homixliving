import assert from "node:assert/strict";
import type { Agent } from "@/db/schema";
import {
  canPurchasePlanProduct,
  isPlanPaymentProduct,
  onboardingLicenseTransferFeeCents,
} from "../plan-payments";

function agent(overrides: Partial<Agent>): Agent {
  return {
    accountStatus: "active",
    plan: "solo",
    affiliationTermMonths: 12,
    ...overrides,
  } as Agent;
}

assert.equal(isPlanPaymentProduct("one_year_membership"), true);
assert.equal(isPlanPaymentProduct("company_domain_email"), false);
assert.equal(canPurchasePlanProduct(agent({ accountStatus: "pending" }), "one_year_membership").ok, true);
assert.equal(canPurchasePlanProduct(agent({ accountStatus: "pending" }), "two_year_membership").ok, false);
assert.equal(canPurchasePlanProduct(agent({ accountStatus: "pending", paymentStatus: "paid" }), "one_year_membership").ok, false);
assert.equal(canPurchasePlanProduct(agent({ plan: "team_member", teamId: 9 }), "elite_desk_fee").ok, false);
assert.equal(canPurchasePlanProduct(agent({ plan: "team_member", teamId: 9 }), "one_year_membership").ok, true);
assert.equal(canPurchasePlanProduct(agent({ plan: "solo_pro" }), "one_year_membership").ok, false);
assert.equal(canPurchasePlanProduct(agent({ plan: "solo_pro" }), "elite_desk_fee").ok, true);
assert.equal(canPurchasePlanProduct(agent({ plan: "solo" }), "company_domain_email").ok, true);
assert.equal(canPurchasePlanProduct(agent({ plan: "legacy_growth" }), "growth_desk_fee").ok, false);
assert.equal(
  onboardingLicenseTransferFeeCents(agent({ accountStatus: "pending" }), "one_year_membership"),
  2_000,
);
assert.equal(
  onboardingLicenseTransferFeeCents(agent({ accountStatus: "active" }), "one_year_membership"),
  0,
);
assert.equal(
  onboardingLicenseTransferFeeCents(agent({ accountStatus: "pending" }), "company_domain_email"),
  0,
);

console.log("plan payment tests passed");
