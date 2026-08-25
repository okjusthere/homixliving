import assert from "node:assert/strict";
import {
  interpretPublicIdentityResult,
} from "@/lib/public-identity-status";

assert.deepEqual(
  interpretPublicIdentityResult({
    ok: true,
    status: 200,
    body: { verificationStatus: "verified", notice: "Verified" },
  }),
  { status: "verified", notice: "Verified" },
);

assert.equal(
  interpretPublicIdentityResult({
    ok: true,
    status: 200,
    body: { verificationStatus: "unmatched" },
  }).status,
  "unmatched",
);

assert.equal(
  interpretPublicIdentityResult({ ok: false, status: 404, body: {} }).status,
  "unlinked",
);
assert.equal(
  interpretPublicIdentityResult({ ok: false, status: 502, body: {} }).status,
  "failed",
);

console.log("public identity status tests passed");
