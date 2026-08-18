import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const EMAIL_CHANGE_COOKIE = "homix_email_change";

export function createEmailChangeToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashEmailChangeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function emailChangeTokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashEmailChangeToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
