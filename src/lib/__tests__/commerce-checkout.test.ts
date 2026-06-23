import assert from "node:assert/strict";
import { validateCheckoutPayload } from "../commerce/checkout";

process.env.GOOGLE_WORKSPACE_ALLOWED_DOMAINS = "homixny.com";

const base = {
  customerName: "Jane Agent",
  customerEmail: "jane.personal@example.com",
};

const validWorkspace = validateCheckoutPayload({
  ...base,
  productKey: "company_domain_email",
  requestedWorkspaceEmail: "jane@homixny.com",
});
assert.equal(validWorkspace.ok, true);

const wrongDomain = validateCheckoutPayload({
  ...base,
  productKey: "company_domain_email",
  requestedWorkspaceEmail: "jane@example.com",
});
assert.equal(wrongDomain.ok, false);

const missingReferral = validateCheckoutPayload({
  ...base,
  productKey: "elite_desk_fee",
});
assert.equal(missingReferral.ok, false);

const validReferral = validateCheckoutPayload({
  ...base,
  productKey: "elite_desk_fee",
  referralHasAgent: "yes",
  referralAgentName: "Alex Referral",
});
assert.equal(validReferral.ok, true);

console.log("commerce checkout tests passed");
