import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { onboardingInvitations } from "@/db/schema";

export const ONBOARDING_INVITE_COOKIE = "homix_onboarding_invite";
export const ONBOARDING_SOURCES = ["direct", "exp", "real", "voro", "other"] as const;
export type OnboardingSource = (typeof ONBOARDING_SOURCES)[number];

export function cleanOnboardingSource(value: unknown): OnboardingSource {
  const source = String(value || "direct").trim().toLowerCase();
  return ONBOARDING_SOURCES.includes(source as OnboardingSource)
    ? (source as OnboardingSource)
    : "other";
}

export function createInviteToken() {
  return randomBytes(24).toString("base64url");
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function findUsableInvitation(token: string) {
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(token)) return null;
  const [invite] = await db
    .select()
    .from(onboardingInvitations)
    .where(
      and(
        eq(onboardingInvitations.tokenHash, hashInviteToken(token)),
        isNull(onboardingInvitations.revokedAt),
        gt(onboardingInvitations.expiresAt, new Date().toISOString()),
        sql`${onboardingInvitations.useCount} < ${onboardingInvitations.maxUses}`,
      ),
    )
    .limit(1);
  return invite || null;
}
