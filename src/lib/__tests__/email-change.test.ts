import assert from "node:assert/strict";
import {
  EMAIL_CHANGE_TTL_MS,
  emailChangeExpiresAt,
  isEmailChangeRequestActive,
  isValidLoginEmail,
  normalizeEmail,
} from "../email-change";

assert.equal(normalizeEmail("  Agent@HomixNY.com "), "agent@homixny.com");
assert.equal(normalizeEmail("   "), null);
assert.equal(normalizeEmail(null), null);

assert.equal(isValidLoginEmail("agent@homixny.com"), true);
assert.equal(isValidLoginEmail("agent@localhost"), false);
assert.equal(isValidLoginEmail("not-an-email"), false);
assert.equal(isValidLoginEmail("agent@@homixny.com"), false);
assert.equal(isValidLoginEmail("agent\tname@homixny.com"), false);
assert.equal(isValidLoginEmail(`${"a".repeat(65)}@homixny.com`), false);

const requestedAt = new Date("2026-08-17T12:00:00.000Z");
assert.equal(
  emailChangeExpiresAt(requestedAt),
  new Date(requestedAt.getTime() + EMAIL_CHANGE_TTL_MS).toISOString(),
);
assert.equal(
  emailChangeExpiresAt("2026-08-17 12:00:00+00"),
  new Date(requestedAt.getTime() + EMAIL_CHANGE_TTL_MS).toISOString(),
);
assert.equal(
  isEmailChangeRequestActive(requestedAt, new Date("2026-08-24T11:59:59.999Z")),
  true,
);
assert.equal(
  isEmailChangeRequestActive(requestedAt, new Date("2026-08-24T12:00:00.000Z")),
  false,
);
assert.equal(isEmailChangeRequestActive("invalid", requestedAt), false);

console.log("email change tests passed");
