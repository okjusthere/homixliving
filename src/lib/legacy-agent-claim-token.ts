import { createHash, randomBytes } from "node:crypto";

export const LEGACY_CLAIM_COOKIE = "homix_legacy_claim";
export const LEGACY_CLAIM_COOKIE_MAX_AGE = 30 * 60;
export const LEGACY_CLAIM_INVITE_DAYS = 7;
export const validLegacyClaimToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);
export const createLegacyClaimToken = () => randomBytes(32).toString("base64url");
export const hashLegacyClaimToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const isLegacyGmail = (email: string | null) => Boolean(email && /^[^\s@]+@gmail\.com$/.test(email));
