import assert from "node:assert/strict";
import {
  hasPortalAccess,
  isAgentAccountStatus,
  normalizeAgentAccountStatus,
} from "../agent-lifecycle";

assert.equal(isAgentAccountStatus("pending"), true);
assert.equal(isAgentAccountStatus("active"), true);
assert.equal(isAgentAccountStatus("inactive"), true);
assert.equal(isAgentAccountStatus("approved"), false);
assert.equal(isAgentAccountStatus(true), false);

assert.equal(normalizeAgentAccountStatus("active"), "active");
assert.equal(normalizeAgentAccountStatus("revoked"), "pending");
assert.equal(normalizeAgentAccountStatus(undefined, "active"), "active");

assert.equal(hasPortalAccess("active"), true);
assert.equal(hasPortalAccess("pending"), false);
assert.equal(hasPortalAccess("inactive"), false);

console.log("agent lifecycle tests passed");
