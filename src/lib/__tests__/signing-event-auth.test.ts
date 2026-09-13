import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySigningEvent } from "../signing-event-auth";

const secret = "synthetic-callback-secret-".repeat(2);
const now = Date.now();
const timestamp = String(Math.floor(now / 1000));
const body = JSON.stringify({
  event: "signing.changed",
  requestId: "synthetic",
});
const signature = createHmac("sha256", secret)
  .update(`${timestamp}.${body}`)
  .digest("hex");
assert.equal(verifySigningEvent(body, timestamp, signature, secret, now), true);
assert.equal(
  verifySigningEvent(
    body.replace("synthetic", "another-owner"),
    timestamp,
    signature,
    secret,
    now,
  ),
  false,
);
assert.equal(
  verifySigningEvent(body, timestamp, signature, "different-".repeat(5), now),
  false,
);
assert.equal(
  verifySigningEvent(body, timestamp, signature, secret, now + 301_000),
  false,
);
assert.equal(
  verifySigningEvent(body, timestamp, signature, secret, now - 301_000),
  false,
);
for (const invalid of [null, "", "0", "z".repeat(64), signature + "0"])
  assert.equal(
    verifySigningEvent(body, timestamp, invalid, secret, now),
    false,
  );
assert.equal(
  verifySigningEvent(body, timestamp, signature, undefined, now),
  false,
);
assert.equal(verifySigningEvent(body, "NaN", signature, secret, now), false);
console.log(
  "PASS: callback authentication rejects tampering, wrong secrets, replay windows and malformed signatures",
);
