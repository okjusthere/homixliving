import assert from "node:assert/strict";
import { completionRequest, parseMoneyCents, receiptMissingReasons } from "@/components/admin/onboarding-completion";

assert.equal(parseMoneyCents("308"), 30800);
assert.equal(parseMoneyCents("307.01"), 30701);
for (const value of ["", "-1", "1.001", "NaN", "1000001"])
  assert.equal(parseMoneyCents(value), null, value);
const receipt = { amount: "308", method: "check", reference: "11", receivedAt: "2026-09-14" };
assert.deepEqual(receiptMissingReasons(receipt, true, "2026-09-14"), [], "A two-character check reference is valid");
assert.deepEqual(receiptMissingReasons({ ...receipt, method: "cash", reference: "" }, true, "2026-09-14"), []);
assert.equal(receiptMissingReasons({ ...receipt, reference: "" }, true, "2026-09-14").length, 1);
assert.equal(receiptMissingReasons({ ...receipt, amount: "0" }, true, "2026-09-14").length, 1, "A waiver is not a receipt");
for (const receivedAt of ["2026-02-30", "2026-09-15", ""])
  assert.equal(receiptMissingReasons({ ...receipt, receivedAt }, true, "2026-09-14").length, 1);
const request = completionRequest({ mode: "waiver", waiverAmountCents: 30800, reason: "Approved company waiver" }, "stable-test-key");
assert.equal(request.action, "complete_onboarding");
assert.equal(request.confirmed, true);
assert.equal("receipt" in request, false);
assert.equal("receiptId" in request, false);
assert.deepEqual(request, completionRequest({ mode: "waiver", waiverAmountCents: 30800, reason: "Approved company waiver" }, "stable-test-key"));
console.log("PASS: exact money parsing, short reference, cash, invalid dates, and no fictitious waiver receipt");
