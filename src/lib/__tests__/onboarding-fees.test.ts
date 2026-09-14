import assert from "node:assert/strict";
import { createOnboardingFeeAdjustment, fullyWaivedOnboarding, onboardingFeeQuote } from "@/lib/onboarding-fees";
const subject = { plan: "solo" as const, affiliationTermMonths: 12, licensedCompanyId: "homix_realty" as const };
const full = createOnboardingFeeAdjustment(subject, 30800, "Company approved full waiver", 1);
const free = { ...subject, onboardingFeeAdjustment: full, paymentStatus: "not_required" as const };
assert.equal(onboardingFeeQuote(subject).originalAmountCents, 30800);
assert.equal(fullyWaivedOnboarding(free), true);
assert.equal(fullyWaivedOnboarding({ ...subject, paymentStatus: "not_required" }), false, "Status alone cannot waive fees");
for (const altered of [{ plan: "solo_pro" as const }, { affiliationTermMonths: 24 },
  { licensedCompanyId: "homix_living" as const }])
  assert.equal(fullyWaivedOnboarding({ ...free, ...altered }), false, "Waiver must match the approved fee basis");
for (const amount of [0, -1, 30801, 100.5, NaN])
  assert.throws(() => createOnboardingFeeAdjustment(subject, amount, "Company approved full waiver", 1));
console.log("PASS: fee reductions bind to the approved plan, term, company and amount");
