import assert from "node:assert/strict";
import { validateCheckoutPayload } from "../commerce/checkout";
import { normalizeWorkspaceRecoveryPhone, resolveWorkspaceRetentionDays } from "../google-workspace";

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

assert.equal(normalizeWorkspaceRecoveryPhone("(929) 666-9886"), "+19296669886");
assert.equal(normalizeWorkspaceRecoveryPhone("1 929 666 9886"), "+19296669886");
assert.equal(normalizeWorkspaceRecoveryPhone("+44 20 7946 0958"), "+442079460958");
assert.equal(normalizeWorkspaceRecoveryPhone("12345"), undefined);

assert.equal(resolveWorkspaceRetentionDays(undefined), 30);
assert.equal(resolveWorkspaceRetentionDays("45"), 45);
assert.equal(resolveWorkspaceRetentionDays("7.8"), 7);
assert.equal(resolveWorkspaceRetentionDays("0"), 30);
assert.equal(resolveWorkspaceRetentionDays("not-a-number"), 30);

console.log("commerce checkout tests passed");
