import { createHmac } from "node:crypto";

// Keep the existing non-null expiry/usage schema and redemption path. These
// bounds remove campaign-style limits from the standing personal link.
export const PERSONAL_REFERRAL_EXPIRES_AT = "9999-12-31T23:59:59.000Z";
export const PERSONAL_REFERRAL_MAX_USES = 2_147_483_647;

/** Recover a shareable token without storing its plaintext in the database. */
export function personalReferralToken(invitationId: number, agentId: number, secret: string) {
  if (!secret.trim()) throw new Error("A referral signing secret is required.");
  if (![invitationId, agentId].every((id) => Number.isSafeInteger(id) && id > 0)) {
    throw new Error("Invalid referral identity.");
  }
  return createHmac("sha256", secret)
    .update(`homix:personal-referral:v1:${agentId}:${invitationId}`)
    .digest("base64url");
}
