import { dbDatePart } from "@/lib/db-time";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { after } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import {
  agentEmailAddresses,
  agentLoginIdentities,
  agents,
  onboardingEvents,
  teams,
} from "@/db/schema";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { authConfig } from "./auth.config";
import { DEFAULT_AGENT_SPLIT_PCT } from "@/lib/splits";
import { adminAgentIds, notify } from "@/lib/notify";
import { isConfiguredAdminEmail } from "@/lib/admin-emails";
import { logAudit } from "@/lib/audit";
import {
  isEmailChangeRequestActive,
  normalizeEmail,
} from "@/lib/email-change";
import {
  EMAIL_CHANGE_COOKIE,
  emailChangeTokenMatches,
} from "@/lib/email-change-token";
import { PLAN_SPLIT_PCT } from "@/lib/agent-plans";
import {
  findUsableInvitation,
  ONBOARDING_INVITE_COOKIE,
} from "@/lib/onboarding-invites";
import {
  ONBOARDING_ENTRY_COOKIE,
  onboardingEntryForSignIn,
} from "@/lib/onboarding-entry";
import { onboardingEventValues } from "@/lib/onboarding-events";
import { claimLegacyAgent, LegacyClaimError } from "@/lib/legacy-agent-claims";
import { LEGACY_CLAIM_COOKIE } from "@/lib/legacy-agent-claim-token";

const googleEnabled =
  !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

type Agent = typeof agents.$inferSelect;

class EmailLinkConflictError extends Error {}
class IdentityConflictError extends Error {}

async function reconcileConfiguredAccess(
  existing: Agent,
  admin: boolean,
  name: string | null | undefined,
) {
  // A person may sign in through a personal alias. Never remove an existing
  // admin grant merely because that alias is not listed in ADMIN_EMAILS.
  const needsAdminFlip = admin && !existing.isAdmin;
  const needsActiveForce = admin && existing.accountStatus !== "active";
  const needsNameFill = !existing.name && Boolean(name);

  if (!needsAdminFlip && !needsActiveForce && !needsNameFill) {
    return existing;
  }

  const [updated] = await db
    .update(agents)
    .set({
      ...(needsAdminFlip ? { isAdmin: true } : {}),
      ...(needsActiveForce ? { accountStatus: "active" as const } : {}),
      ...(needsNameFill ? { name: name! } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(agents.id, existing.id))
    .returning();

  return updated || existing;
}

async function loadAgentFromDatabase(user: {
  agentId?: number | null;
  email?: string | null;
  name?: string | null;
}) {
  if (user.agentId) {
    const [byId] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, user.agentId))
      .limit(1);
    if (byId) {
      return reconcileConfiguredAccess(
        byId,
        isConfiguredAdminEmail(byId.email),
        user.name,
      );
    }
  }

  if (!user.email) throw new Error("Agent account not found");

  const email = user.email.trim().toLowerCase();
  const [linked] = await db
    .select({ agent: agents })
    .from(agentEmailAddresses)
    .innerJoin(agents, eq(agentEmailAddresses.agentId, agents.id))
    .where(and(
      sql`lower(${agentEmailAddresses.email}) = ${email}`,
      eq(agentEmailAddresses.canSignIn, true),
      isNotNull(agentEmailAddresses.verifiedAt),
    ))
    .limit(1);

  if (!linked?.agent) {
    throw new Error(`Agent account not found for ${email}`);
  }

  return reconcileConfiguredAccess(
    linked.agent,
    isConfiguredAdminEmail(email) || isConfiguredAdminEmail(linked.agent.email),
    user.name,
  );
}

async function agentForGoogleSubject(providerSubject: string) {
  const [linked] = await db
    .select({ agent: agents })
    .from(agentLoginIdentities)
    .innerJoin(agents, eq(agentLoginIdentities.agentId, agents.id))
    .where(and(
      eq(agentLoginIdentities.provider, "google"),
      eq(agentLoginIdentities.providerSubject, providerSubject),
      isNull(agentLoginIdentities.disabledAt),
    ))
    .limit(1);
  return linked?.agent || null;
}

async function agentForVerifiedLoginEmail(email: string) {
  const [linked] = await db
    .select({ agent: agents })
    .from(agentEmailAddresses)
    .innerJoin(agents, eq(agentEmailAddresses.agentId, agents.id))
    .where(and(
      sql`lower(${agentEmailAddresses.email}) = ${email}`,
      eq(agentEmailAddresses.canSignIn, true),
      isNotNull(agentEmailAddresses.verifiedAt),
    ))
    .limit(1);
  return linked?.agent || null;
}

async function recordVerifiedGoogleIdentity(
  agent: Agent,
  email: string,
  providerSubject: string,
  source: "sign_in" | "legacy_bootstrap" | "application" | "legacy_claim",
) {
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx
      .insert(agentEmailAddresses)
      .values({
        agentId: agent.id,
        email,
        kind: "login",
        canSignIn: true,
        isPrimary: email === agent.email.toLowerCase(),
        verifiedAt: now,
        source,
        updatedAt: now,
      })
      .onConflictDoNothing();

    const [emailOwner] = await tx
      .select({ agentId: agentEmailAddresses.agentId })
      .from(agentEmailAddresses)
      .where(sql`lower(${agentEmailAddresses.email}) = ${email}`)
      .limit(1);
    if (!emailOwner || emailOwner.agentId !== agent.id) {
      throw new IdentityConflictError("Verified email belongs to another Agent");
    }

    await tx
      .insert(agentLoginIdentities)
      .values({
        agentId: agent.id,
        provider: "google",
        providerSubject,
        emailAtLink: email,
        isPrimary: email === agent.email.toLowerCase(),
        verifiedAt: now,
        lastUsedAt: now,
        source,
        updatedAt: now,
      })
      .onConflictDoNothing();

    const [identityOwner] = await tx
      .select({ agentId: agentLoginIdentities.agentId })
      .from(agentLoginIdentities)
      .where(and(
        eq(agentLoginIdentities.provider, "google"),
        eq(agentLoginIdentities.providerSubject, providerSubject),
      ))
      .limit(1);
    if (!identityOwner || identityOwner.agentId !== agent.id) {
      throw new IdentityConflictError("Google identity belongs to another Agent");
    }

    await tx
      .update(agentLoginIdentities)
      .set({ emailAtLink: email, lastUsedAt: now, updatedAt: now })
      .where(and(
        eq(agentLoginIdentities.provider, "google"),
        eq(agentLoginIdentities.providerSubject, providerSubject),
        eq(agentLoginIdentities.agentId, agent.id),
      ));
  });
}

async function completeEmailAliasLink(
  pendingAgent: Agent,
  email: string,
  providerSubject: string,
) {
  if (!isEmailChangeRequestActive(pendingAgent.emailChangeRequestedAt)) {
    throw new Error(`Email change request expired for ${email}`);
  }

  const verificationToken = (await cookies()).get(EMAIL_CHANGE_COOKIE)?.value;
  if (
    !verificationToken ||
    !pendingAgent.emailChangeTokenHash ||
    !emailChangeTokenMatches(verificationToken, pendingAgent.emailChangeTokenHash)
  ) {
    throw new Error(`Email change verification context missing for ${email}`);
  }

  const now = new Date().toISOString();

  let updated: Agent;
  try {
    updated = await db.transaction(async (tx) => {
      await tx
        .insert(agentEmailAddresses)
        .values({
          agentId: pendingAgent.id,
          email,
          kind: "login",
          canSignIn: true,
          isPrimary: false,
          verifiedAt: now,
          source: "self_service_alias",
          updatedAt: now,
        })
        .onConflictDoNothing();
      const [newAddress] = await tx
        .select({ agentId: agentEmailAddresses.agentId })
        .from(agentEmailAddresses)
        .where(sql`lower(${agentEmailAddresses.email}) = ${email}`)
        .limit(1);
      if (!newAddress || newAddress.agentId !== pendingAgent.id) {
        throw new EmailLinkConflictError();
      }
      await tx
        .update(agentEmailAddresses)
        .set({ canSignIn: true, verifiedAt: now, updatedAt: now })
        .where(and(
          eq(agentEmailAddresses.agentId, pendingAgent.id),
          sql`lower(${agentEmailAddresses.email}) = ${email}`,
        ));
      await tx
        .insert(agentLoginIdentities)
        .values({
          agentId: pendingAgent.id,
          provider: "google",
          providerSubject,
          emailAtLink: email,
          isPrimary: false,
          verifiedAt: now,
          lastUsedAt: now,
          source: "self_service_alias",
          updatedAt: now,
        })
        .onConflictDoNothing();
      const [identityOwner] = await tx
        .select({ agentId: agentLoginIdentities.agentId })
        .from(agentLoginIdentities)
        .where(and(
          eq(agentLoginIdentities.provider, "google"),
          eq(agentLoginIdentities.providerSubject, providerSubject),
        ))
        .limit(1);
      if (!identityOwner || identityOwner.agentId !== pendingAgent.id) {
        throw new EmailLinkConflictError();
      }
      await tx
        .update(agentLoginIdentities)
        .set({ emailAtLink: email, lastUsedAt: now, disabledAt: null, updatedAt: now })
        .where(and(
          eq(agentLoginIdentities.agentId, pendingAgent.id),
          eq(agentLoginIdentities.provider, "google"),
          eq(agentLoginIdentities.providerSubject, providerSubject),
        ));

      const [changedAgent] = await tx
        .update(agents)
        .set({
          pendingEmail: null,
          emailChangeRequestedAt: null,
          emailChangeTokenHash: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(agents.id, pendingAgent.id),
            sql`lower(${agents.pendingEmail}) = ${email}`,
          ),
        )
        .returning();
      if (!changedAgent) throw new EmailLinkConflictError();
      return changedAgent;
    });
  } catch (error) {
    if (error instanceof EmailLinkConflictError) {
      throw new Error(`Email link request no longer available for ${email}`);
    }
    throw error;
  }

  await logAudit(
    { user: { email: pendingAgent.email } },
    "link_login_email",
    "agent",
    updated.id,
    `已验证并关联登录邮箱 ${email}`,
    { primaryEmail: pendingAgent.email, linkedEmail: email },
  );

  return updated;
}

async function upsertAgentFromGoogle(user: {
  email?: string | null;
  name?: string | null;
  providerSubject?: string | null;
}) {
  if (!user.email || !user.providerSubject) {
    throw new Error("Google account has no stable identity");
  }

  const email = normalizeEmail(user.email);
  if (!email) throw new Error("Google account has no email");
  const providerSubject = user.providerSubject.trim();
  if (!providerSubject) throw new Error("Google account has no stable identity");

  const admin = isConfiguredAdminEmail(email);
  const now = new Date().toISOString();
  const cookieStore = await cookies();
  const legacyToken = cookieStore.get(LEGACY_CLAIM_COOKIE)?.value;
  async function resolveLegacyClaim(token?: string) {
    const legacyAgentId = await claimLegacyAgent({ email: email!, providerSubject, emailVerified: true, token });
    if (!legacyAgentId) return null;
    const [legacyAgent] = await db.select().from(agents).where(eq(agents.id, legacyAgentId)).limit(1);
    if (!legacyAgent) throw new LegacyClaimError("CLAIM_UNAVAILABLE");
    await recordVerifiedGoogleIdentity(legacyAgent, email!, providerSubject, "legacy_claim");
    if (token) cookieStore.delete(LEGACY_CLAIM_COOKIE);
    return legacyAgent;
  }
  // An explicit bearer link must resolve exactly its own profile. Ordinary
  // established logins, however, keep their existing identity/merge semantics.
  if (legacyToken) {
    const claimed = await resolveLegacyClaim(legacyToken);
    if (!claimed) throw new LegacyClaimError("INVALID_INVITATION");
    return claimed;
  }
  const inviteToken = cookieStore.get(ONBOARDING_INVITE_COOKIE)?.value;
  const hasInvitationContext = inviteToken
    ? Boolean(await findUsableInvitation(inviteToken))
    : false;
  const entryContext = onboardingEntryForSignIn(
    cookieStore.get(ONBOARDING_ENTRY_COOKIE)?.value,
    hasInvitationContext,
  );
  const initialPlan = !admin && entryContext?.plan ? entryContext.plan : "solo";

  const identityAgent = await agentForGoogleSubject(providerSubject);
  if (identityAgent) {
    await recordVerifiedGoogleIdentity(identityAgent, email, providerSubject, "sign_in");
    return reconcileConfiguredAccess(identityAgent, admin, user.name);
  }

  const emailAgent = await agentForVerifiedLoginEmail(email);
  if (emailAgent) {
    await recordVerifiedGoogleIdentity(emailAgent, email, providerSubject, "sign_in");
    return reconcileConfiguredAccess(emailAgent, admin, user.name);
  }

  // Compatibility bridge for a deploy where the additive backfill has not yet
  // captured an older manually-created Agent row.
  const [existing] = await db
    .select()
    .from(agents)
    .where(sql`lower(${agents.email}) = ${email}`)
    .limit(1);

  if (existing) {
    await recordVerifiedGoogleIdentity(existing, email, providerSubject, "legacy_bootstrap");
    return reconcileConfiguredAccess(existing, admin, user.name);
  }

  const [pendingAgent] = await db
    .select()
    .from(agents)
    .where(sql`lower(${agents.pendingEmail}) = ${email}`)
    .limit(1);

  if (pendingAgent) {
    const updated = await completeEmailAliasLink(pendingAgent, email, providerSubject);
    return reconcileConfiguredAccess(updated, admin, user.name);
  }

  const claimed = await resolveLegacyClaim();
  if (claimed) return claimed;

  // Ordinary sign-in is not registration. A new person record may only be
  // created by a configured admin, an invitation, or the explicit /join flow.
  if (!admin && !hasInvitationContext && !entryContext) {
    return null;
  }

  const created = await db.transaction(async (tx) => {
    const [newAgent] = await tx
      .insert(agents)
      .values({
        email,
        name: user.name || email.split("@")[0],
        isAdmin: admin,
        accountStatus: admin ? "active" : "pending",
        splitPct: PLAN_SPLIT_PCT[initialPlan] ?? DEFAULT_AGENT_SPLIT_PCT,
        plan: initialPlan,
        onboardingSource: !admin ? entryContext?.source || "direct" : "direct",
        planEffectiveFrom: dbDatePart(now),
        anniversaryStart: dbDatePart(now),
        joinedAt: dbDatePart(now),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: agents.email })
      .returning();
    if (!newAgent) return null;
    await tx.insert(agentEmailAddresses).values({
      agentId: newAgent.id,
      email,
      kind: "login",
      canSignIn: true,
      isPrimary: true,
      verifiedAt: now,
      source: admin ? "admin_bootstrap" : "application",
      updatedAt: now,
    });
    await tx.insert(agentLoginIdentities).values({
      agentId: newAgent.id,
      provider: "google",
      providerSubject,
      emailAtLink: email,
      isPrimary: true,
      verifiedAt: now,
      lastUsedAt: now,
      source: admin ? "admin_bootstrap" : "application",
      updatedAt: now,
    });
    return newAgent;
  });

  if (created && !admin) {
    // Admin notification is not part of the OAuth critical path.
    after(async () => {
      try {
        await db.insert(onboardingEvents).values(onboardingEventValues({
          eventType: "application_account_created",
          agentId: created.id,
          actorAgentId: created.id,
          actorEmail: created.email,
          detail: {
            source: entryContext?.source || "direct",
            locale: entryContext?.locale || null,
            campaign: entryContext?.campaign || null,
            planHint: entryContext?.plan || null,
            invitationContext: hasInvitationContext,
          },
        }));
      } catch (error) {
        console.error("application_account_created event failed", error);
      }
      try {
        await notify({
          recipientAgentIds: await adminAgentIds(),
          type: "agent_pending",
          title: `新经纪人待审批：${user.name || email}`,
          body: `${email} 刚通过 Google 登录注册，等待开通。来源：${entryContext?.source === "website" ? "Homix 官网" : hasInvitationContext ? "邀请链接" : "直接注册"}。`,
          href: "/agents",
          dedupeKey: `agent-pending:${email}`,
          email: true,
        });
      } catch (error) {
        console.error("agent_pending notification failed", error);
      }
    });
  }

  const upserted =
    created ||
    (await agentForGoogleSubject(providerSubject)) ||
    (await agentForVerifiedLoginEmail(email));

  if (!upserted) {
    throw new Error(`Failed to upsert agent for ${email}`);
  }

  return reconcileConfiguredAccess(upserted, admin, user.name);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: googleEnabled
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID!,
          clientSecret: process.env.AUTH_GOOGLE_SECRET!,
        }),
      ]
    : [],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      if (profile?.email_verified !== true || !profile.email || !account.providerAccountId) {
        return false;
      }
      try {
        return Boolean(await upsertAgentFromGoogle({
          email: profile.email,
          name: typeof profile.name === "string" ? profile.name : null,
          providerSubject: account.providerAccountId,
        }));
      } catch (error) {
        if (error instanceof LegacyClaimError) {
          console.warn("Legacy claim denied", { code: error.code });
          return "/login?error=LegacyClaimConflict";
        }
        console.error("Google identity resolution failed", error);
        return false;
      }
    },
    async jwt({ token, user, trigger, account }) {
      const email =
        (typeof user?.email === "string" && user.email) ||
        (typeof token.email === "string" && token.email) ||
        "";

      if (!email) return token;

      // `auth()` re-invokes this callback on nearly every page/API request
      // (it's how session reads work with the JWT strategy), and
      // upsertAgentFromGoogle does 2-4 DB round-trips. Running that on every
      // single request — multiplied by Next.js's automatic link prefetching
      // firing several requests at once — was hammering the shared Supabase
      // connection pool and causing the CONNECT_TIMEOUTs seen in prod. Only
      // hit the database on actual sign-in (`user` present) or when the
      // cached isAdmin/accountStatus is more than a few minutes old, so an
      // admin approving/promoting someone still lands within a few minutes
      // without a full sign-out required.
      const isFreshSignIn = Boolean(user && account?.provider === "google");
      const checkedAt = typeof token.checkedAt === "number" ? token.checkedAt : 0;
      const isStale =
        trigger === "update" ||
        typeof token.isTeamLeader !== "boolean" ||
        Date.now() - checkedAt > 5 * 60 * 1000;
      if (!isFreshSignIn && !isStale) {
        return token;
      }

      const identity = {
        email,
        name:
          (typeof user?.name === "string" && user.name) ||
          (typeof token.name === "string" ? token.name : null),
      };
      const agent = isFreshSignIn
        ? await upsertAgentFromGoogle({
            ...identity,
            providerSubject: account?.providerAccountId,
          })
        : await loadAgentFromDatabase({
            ...identity,
            agentId: typeof token.agentId === "number" ? token.agentId : null,
          });
      if (!agent) throw new Error("Google account is not linked to a Homix Agent");

      token.agentId = agent.id;
      token.email = agent.email;
      token.name = agent.name;
      token.isAdmin = Boolean(agent.isAdmin);
      token.accountStatus = agent.accountStatus;
      const [leadership] = await db
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.leaderAgentId, agent.id))
        .limit(1);
      token.isTeamLeader = Boolean(leadership);
      // Derived compatibility flag for deal-access helpers. The database has
      // one lifecycle source of truth: account_status.
      token.isActive = agent.accountStatus === "active";
      token.checkedAt = Date.now();

      return token;
    },
    // session callback intentionally omitted — it lives in src/auth.config.ts
    // so edge middleware sees the same custom fields. See the comment there.
  },
});
