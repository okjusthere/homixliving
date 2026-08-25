import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { agents, onboardingInvitations, teamCompensationConfigs, teams } from "@/db/schema";
import { PLAN_SPLIT_PCT, type AgentPlan } from "@/lib/agent-plans";
import { adminAgentIds, notify } from "@/lib/notify";
import {
  findUsableInvitation,
  ONBOARDING_INVITE_COOKIE,
} from "@/lib/onboarding-invites";
import {
  applyInvitationRouting,
  invitationLocks,
} from "@/lib/onboarding-routing";
import { lockOnboardingAgent } from "@/lib/advisory-locks";

const ONBOARDING_PLANS = new Set<AgentPlan>(["solo", "solo_pro", "team_member", "holding"]);

class OnboardingProfileConflict extends Error {}

async function currentAgent() {
  const session = await auth();
  if (!session?.user?.email) return null;
  const email = session.user.email.trim().toLowerCase();
  return db
    .select()
    .from(agents)
    .where(sql`lower(${agents.email}) = ${email}`)
    .limit(1)
    .then((rows) => rows[0] || null);
}

async function currentInvitation(agent: typeof agents.$inferSelect) {
  if (agent.onboardingInviteId) {
    const [invite] = await db
      .select()
      .from(onboardingInvitations)
      .where(eq(onboardingInvitations.id, agent.onboardingInviteId))
      .limit(1);
    return invite || null;
  }
  const token = (await cookies()).get(ONBOARDING_INVITE_COOKIE)?.value;
  return token ? findUsableInvitation(token) : null;
}

function cleanText(value: unknown, max = 160) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, max) : null;
}

export async function GET() {
  const agent = await currentAgent();
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const invitation = await currentInvitation(agent);
  const locks = invitationLocks(invitation);
  const today = new Date().toISOString().slice(0, 10);
  const [teamRows, sponsorRows, configRows] = await Promise.all([
    db.select({ id: teams.id, name: teams.name }).from(teams).orderBy(teams.name),
    db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(eq(agents.accountStatus, "active"))
      .orderBy(agents.name),
    db
      .select({
        id: teamCompensationConfigs.id,
        teamId: teamCompensationConfigs.teamId,
        effectiveFrom: teamCompensationConfigs.effectiveFrom,
        defaultTeamSplitPct: teamCompensationConfigs.defaultTeamSplitPct,
        teamLeadSplitPct: teamCompensationConfigs.teamLeadSplitPct,
        teamCapCents: teamCompensationConfigs.teamCapCents,
      })
      .from(teamCompensationConfigs)
      .where(lte(teamCompensationConfigs.effectiveFrom, today))
      .orderBy(desc(teamCompensationConfigs.effectiveFrom), desc(teamCompensationConfigs.version)),
  ]);
  const currentConfigByTeam = new Map<number, (typeof configRows)[number]>();
  for (const config of configRows) {
    if (!currentConfigByTeam.has(config.teamId)) currentConfigByTeam.set(config.teamId, config);
  }
  const frozenTerms = agent.teamTermsConfigId
    ? configRows.find((config) => config.id === agent.teamTermsConfigId) || null
    : null;
  return NextResponse.json({
    profile: {
      plan: agent.plan,
      teamId: agent.teamId,
      referredByAgentId: agent.referredByAgentId,
      affiliationTermMonths: agent.affiliationTermMonths,
      onboardingCompletedAt: agent.onboardingCompletedAt,
      onboardingStage: agent.onboardingStage,
      agreementStatus: agent.agreementStatus,
      paymentStatus: agent.paymentStatus,
      legalName: agent.legalName,
      phone: agent.phone,
      licenseNumber: agent.licenseNumber,
      licensedCompany: agent.licensedCompany,
      practice: agent.practice,
      teamTerms: frozenTerms,
    },
    routing: invitation ? {
      locked: locks.plan || locks.team || locks.sponsor || locks.term,
      locks,
      kind: invitation.kind,
      source: invitation.source,
      plan: locks.plan ? invitation.plan : agent.plan,
      teamId: locks.team ? invitation.teamId : agent.teamId,
      referredByAgentId: locks.sponsor ? invitation.sponsorAgentId : agent.referredByAgentId,
      affiliationTermMonths: locks.term
        ? invitation.affiliationTermMonths
        : agent.affiliationTermMonths,
    } : {
      locked: false,
      locks,
      kind: null,
      source: agent.onboardingSource,
    },
    teams: teamRows.map((team) => ({ ...team, compensationConfig: currentConfigByTeam.get(team.id) || null })),
    sponsors: sponsorRows.filter((row) => row.id !== agent.id),
  });
}

export async function PUT(req: NextRequest) {
  const agent = await currentAgent();
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (agent.accountStatus !== "pending") {
    return NextResponse.json({ error: "Onboarding is only available to pending accounts." }, { status: 403 });
  }
  if (agent.agreementStatus !== "not_started") {
    return NextResponse.json(
      { error: "Onboarding facts are frozen after the agreement is sent." },
      { status: 409 },
    );
  }
  const body = await req.json().catch(() => ({}));
  const invitation = await currentInvitation(agent);
  if (invitation?.email && invitation.email.toLowerCase() !== agent.email.toLowerCase()) {
    return NextResponse.json({ error: "This invitation belongs to another email." }, { status: 403 });
  }
  const requestedPlan = String(body.plan || "solo") as AgentPlan;
  if (!ONBOARDING_PLANS.has(requestedPlan)) {
    return NextResponse.json({ error: "Invalid compensation track" }, { status: 400 });
  }
  const requestedTeamId = body.teamId ? Number(body.teamId) : null;
  const requestedSponsorId = body.referredByAgentId ? Number(body.referredByAgentId) : null;
  if (requestedTeamId !== null && (!Number.isInteger(requestedTeamId) || requestedTeamId <= 0)) {
    return NextResponse.json({ error: "Invalid team" }, { status: 400 });
  }
  if (requestedSponsorId !== null && (!Number.isInteger(requestedSponsorId) || requestedSponsorId <= 0)) {
    return NextResponse.json({ error: "Invalid sponsor" }, { status: 400 });
  }
  const requestedTerm = requestedPlan === "solo_pro"
    ? 12
    : Number(body.affiliationTermMonths) === 24 ? 24 : 12;
  const routing = applyInvitationRouting(
    {
      plan: requestedPlan,
      teamId: requestedTeamId,
      sponsorAgentId: requestedSponsorId,
      affiliationTermMonths: requestedTerm,
    },
    invitation ? {
      plan: invitation.plan,
      teamId: invitation.teamId,
      sponsorAgentId: invitation.sponsorAgentId,
      affiliationTermMonths: invitation.affiliationTermMonths,
      lockPlan: invitation.lockPlan,
      lockTeam: invitation.lockTeam,
      lockSponsor: invitation.lockSponsor,
      lockTerm: invitation.lockTerm,
    } : null,
  );
  const { plan, teamId, sponsorAgentId: referredByAgentId, affiliationTermMonths } = routing;
  if (plan === "team_member" && !Number.isInteger(teamId)) {
    return NextResponse.json({ error: "Team members must select a team" }, { status: 400 });
  }
  if (teamId) {
    const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  if (referredByAgentId === agent.id) {
    return NextResponse.json({ error: "An agent cannot sponsor themselves" }, { status: 400 });
  }
  if (referredByAgentId) {
    const [sponsor] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.id, referredByAgentId))
      .limit(1);
    if (!sponsor) return NextResponse.json({ error: "Sponsor not found" }, { status: 404 });
  }
  const legalName = cleanText(body.legalName) || agent.legalName || agent.name;
  const phone = cleanText(body.phone, 40) || agent.phone;
  const licenseNumber = cleanText(body.licenseNumber, 80) || agent.licenseNumber;
  const licensedCompany = cleanText(body.licensedCompany, 120) || agent.licensedCompany;
  const practice = body.practice === "rental" || body.practice === "sales" || body.practice === "both"
    ? body.practice
    : agent.practice;
  const now = new Date().toISOString();
  const teamTermsEffectiveFrom = now.slice(0, 10);
  const teamTermsConfig = plan === "team_member" && teamId
    ? await db
        .select()
        .from(teamCompensationConfigs)
        .where(and(
          eq(teamCompensationConfigs.teamId, teamId),
          lte(teamCompensationConfigs.effectiveFrom, teamTermsEffectiveFrom),
        ))
        .orderBy(desc(teamCompensationConfigs.effectiveFrom), desc(teamCompensationConfigs.version))
        .limit(1)
        .then((rows) => rows[0] || null)
    : null;
  if (plan === "team_member" && !teamTermsConfig) {
    return NextResponse.json({ error: "The selected team has no active compensation terms." }, { status: 409 });
  }
  let updated;
  try {
    updated = await db.transaction(async (tx) => {
      await lockOnboardingAgent(tx, agent.id);
      const [boundAgent] = await tx
        .select({
          accountStatus: agents.accountStatus,
          agreementStatus: agents.agreementStatus,
          onboardingInviteId: agents.onboardingInviteId,
          planEffectiveFrom: agents.planEffectiveFrom,
          anniversaryStart: agents.anniversaryStart,
          joinedAt: agents.joinedAt,
          onboardingSource: agents.onboardingSource,
          paymentStatus: agents.paymentStatus,
        })
        .from(agents)
        .where(eq(agents.id, agent.id))
        .limit(1);
      if (!boundAgent) throw new OnboardingProfileConflict("Agent no longer exists.");
      if (boundAgent.accountStatus !== "pending") {
        throw new OnboardingProfileConflict("Onboarding is only available to pending accounts.");
      }
      if (boundAgent.agreementStatus !== "not_started") {
        throw new OnboardingProfileConflict(
          "Onboarding facts are frozen after agreement preparation begins.",
        );
      }
      if (
        boundAgent.onboardingInviteId &&
        boundAgent.onboardingInviteId !== invitation?.id
      ) {
        throw new OnboardingProfileConflict(
          "A different invitation is already bound to this account.",
        );
      }
      if (invitation && !boundAgent.onboardingInviteId) {
        const [consumed] = await tx
          .update(onboardingInvitations)
          .set({ useCount: sql`${onboardingInvitations.useCount} + 1` })
          .where(and(
            eq(onboardingInvitations.id, invitation.id),
            sql`${onboardingInvitations.useCount} < ${onboardingInvitations.maxUses}`,
          ))
          .returning({ id: onboardingInvitations.id });
        if (!consumed) {
          throw new OnboardingProfileConflict("Invitation has already been used.");
        }
      }
      const [row] = await tx
        .update(agents)
        .set({
          legalName,
          phone,
          licenseNumber,
          licensedCompany,
          practice,
          plan,
          splitPct: PLAN_SPLIT_PCT[plan],
          teamId: plan === "team_member" ? teamId : null,
          referredByAgentId,
          affiliationTermMonths,
          planEffectiveFrom: boundAgent.planEffectiveFrom || now.slice(0, 10),
          anniversaryStart: boundAgent.anniversaryStart || boundAgent.joinedAt || now.slice(0, 10),
          teamTermsConfigId: teamTermsConfig?.id || null,
          teamTermsEffectiveFrom: teamTermsConfig ? teamTermsEffectiveFrom : null,
          teamTermsAcceptedAt: null,
          onboardingCompletedAt: now,
          onboardingStage: "agreement",
          onboardingSource: invitation?.source || boundAgent.onboardingSource || "direct",
          onboardingInviteId: invitation?.id || boundAgent.onboardingInviteId,
          paymentStatus: boundAgent.paymentStatus,
          updatedAt: now,
        })
        .where(eq(agents.id, agent.id))
        .returning();
      return row;
    });
  } catch (error) {
    if (error instanceof OnboardingProfileConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Unable to save onboarding profile", error);
    return NextResponse.json({ error: "Unable to save onboarding profile." }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Unable to save onboarding profile." }, { status: 500 });
  }
  try {
    await notify({
      recipientAgentIds: await adminAgentIds(),
      type: "agent_onboarding_ready",
      title: `入职资料已提交：${agent.name}`,
      body: `${agent.email} 已选择 ${plan}${teamId ? ` · Team #${teamId}` : ""}，下一步为签署协议及缴费。`,
      href: "/agents",
      dedupeKey: `agent-onboarding-ready:${agent.id}:${now.slice(0, 10)}`,
    });
  } catch (error) {
    console.error("onboarding ready notification failed", error);
  }
  return NextResponse.json({ profile: updated });
}
