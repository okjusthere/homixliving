import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySigningEvent } from "../signing-event-auth";
import { NextRequest } from "next/server";
import { authConfig } from "../../auth.config";

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

async function verifyCallbackRouting() {
  const authorized = authConfig.callbacks!.authorized!;
  for (const [path, method, allowed] of [
    ["/api/signing/events", "POST", true],
    ["/api/signing/events", "GET", false],
    ["/api/signing/events/extra", "POST", false],
    ["/api/signing/requests", "POST", false],
    ["/api/signing/requests", "GET", false],
  ] as const) {
    assert.equal(await authorized({ request: new NextRequest(`https://portal.example${path}`, { method }), auth: null }), allowed);
  }
  console.log("PASS: only the exact POST callback reaches HMAC validation without a browser session");
}
void verifyCallbackRouting().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
