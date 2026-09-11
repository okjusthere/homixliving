import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents, onboardingEvents, onboardingInvitations } from "@/db/schema";
import { createInviteToken, hashInviteToken } from "@/lib/onboarding-invites";
import { onboardingEventValues } from "@/lib/onboarding-events";
import { PERSONAL_REFERRAL_EXPIRES_AT, PERSONAL_REFERRAL_MAX_USES, personalReferralToken } from "@/lib/personal-referral-token";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function signingSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Referral signing is not configured.");
  return secret;
}

export async function findPersonalReferral(agentId: number, executor: typeof db | Transaction = db) {
  const rows = await executor.select().from(onboardingInvitations).where(and(
    eq(onboardingInvitations.kind, "personal_referral"),
    eq(onboardingInvitations.createdByAgentId, agentId),
    eq(onboardingInvitations.sponsorAgentId, agentId),
    isNull(onboardingInvitations.email),
    isNull(onboardingInvitations.revokedAt),
    eq(onboardingInvitations.expiresAt, PERSONAL_REFERRAL_EXPIRES_AT),
    gt(onboardingInvitations.expiresAt, new Date().toISOString()),
    sql`${onboardingInvitations.useCount} < ${onboardingInvitations.maxUses}`,
  )).orderBy(desc(onboardingInvitations.id));
  if (!rows.length) return null;
  const secret = signingSecret();
  for (const invite of rows) {
    const token = personalReferralToken(invite.id, agentId, secret);
    if (hashInviteToken(token) === invite.tokenHash) return { id: invite.id, token };
  }
  return null;
}

export async function getOrCreatePersonalReferral(agentId: number) {
  const secret = signingSecret();
  return db.transaction(async (tx) => {
    // Serializes concurrent tabs and retries for the same agent. Recheck live
    // eligibility here instead of trusting a potentially stale session.
    const [agent] = await tx.select({ id: agents.id, accountStatus: agents.accountStatus })
      .from(agents).where(eq(agents.id, agentId)).for("update");
    if (agent?.accountStatus !== "active") return null;
    const existing = await findPersonalReferral(agentId, tx);
    if (existing) return existing;

    const [invite] = await tx.insert(onboardingInvitations).values({
      tokenHash: hashInviteToken(createInviteToken()),
      kind: "personal_referral",
      sponsorAgentId: agentId,
      createdByAgentId: agentId,
      lockSponsor: true,
      lockPlan: false,
      lockTeam: false,
      lockTerm: false,
      lockCompany: false,
      expiresAt: PERSONAL_REFERRAL_EXPIRES_AT,
      maxUses: PERSONAL_REFERRAL_MAX_USES,
    }).returning({ id: onboardingInvitations.id });
    const token = personalReferralToken(invite.id, agentId, secret);
    await tx.update(onboardingInvitations).set({ tokenHash: hashInviteToken(token) })
      .where(eq(onboardingInvitations.id, invite.id));
    await tx.insert(onboardingEvents).values(onboardingEventValues({
      eventType: "invitation_created",
      agentId,
      actorAgentId: agentId,
      invitationId: invite.id,
      detail: { kind: "personal_referral", standingLink: true, sponsorAgentId: agentId },
    }));
    return { id: invite.id, token };
  });
}
