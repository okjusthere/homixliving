import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  agents,
  onboardingEvents,
  onboardingInvitations,
  teamCompensationConfigs,
  teamJoinRequests,
  teams,
} from "@/db/schema";
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
import { resolveOnboardingESignEntity } from "@/lib/esign";
import { onboardingEventValues } from "@/lib/onboarding-events";
import {
  canReuseAcceptedTeamRouting,
  requiresTeamJoinApproval,
} from "@/lib/team-join-requests";

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
  const [teamRows, sponsorRows, configRows, latestTeamJoinRequest] = await Promise.all([
    db
      .select({ id: teams.id, name: teams.name, leaderAgentId: teams.leaderAgentId })
      .from(teams)
      .orderBy(teams.name),
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
    db
      .select({
        id: teamJoinRequests.id,
        teamId: teamJoinRequests.teamId,
        teamName: teams.name,
        status: teamJoinRequests.status,
        requestedAt: teamJoinRequests.requestedAt,
        decidedAt: teamJoinRequests.decidedAt,
        decisionReason: teamJoinRequests.decisionReason,
      })
      .from(teamJoinRequests)
      .innerJoin(teams, eq(teams.id, teamJoinRequests.teamId))
      .where(eq(teamJoinRequests.agentId, agent.id))
      .orderBy(desc(teamJoinRequests.createdAt))
      .limit(1)
      .then((rows) => rows[0] || null),
  ]);
  const currentConfigByTeam = new Map<number, (typeof configRows)[number]>();
  for (const config of configRows) {
    if (!currentConfigByTeam.has(config.teamId)) currentConfigByTeam.set(config.teamId, config);
  }
  const activeAgentIds = new Set(sponsorRows.map((row) => row.id));
  const frozenTerms = agent.teamTermsConfigId
    ? configRows.find((config) => config.id === agent.teamTermsConfigId) || null
    : null;
  const invitedTeamTerms = invitation?.teamCompensationConfigId
    ? configRows.find((config) => config.id === invitation.teamCompensationConfigId) || null
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
    teams: teamRows.map((team) => ({
      ...team,
      requestable: Boolean(
        team.leaderAgentId &&
        activeAgentIds.has(team.leaderAgentId) &&
        currentConfigByTeam.get(team.id),
      ),
      compensationConfig: invitation?.teamId === team.id && invitedTeamTerms
        ? invitedTeamTerms
        : currentConfigByTeam.get(team.id) || null,
    })),
    sponsors: sponsorRows.filter((row) => row.id !== agent.id),
    teamJoinRequest: latestTeamJoinRequest,
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
  const selectedTeam = teamId
    ? await db
        .select({ id: teams.id, name: teams.name, leaderAgentId: teams.leaderAgentId })
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1)
        .then((rows) => rows[0] || null)
    : null;
  if (teamId && !selectedTeam) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  const routeRequiresTeamApproval = requiresTeamJoinApproval({ plan, teamId, invitation });
  const mayReuseAcceptedRouting = canReuseAcceptedTeamRouting({
    requestedPlan: plan,
    requestedTeamId: teamId,
    currentPlan: agent.plan,
    currentTeamId: agent.teamId,
    currentConfigId: agent.teamTermsConfigId,
  });
  const acceptedTeamApproval = routeRequiresTeamApproval && mayReuseAcceptedRouting
    ? await db
        .select({ id: teamJoinRequests.id })
        .from(teamJoinRequests)
        .where(and(
          eq(teamJoinRequests.agentId, agent.id),
          eq(teamJoinRequests.teamId, teamId!),
          eq(teamJoinRequests.acceptedConfigId, agent.teamTermsConfigId!),
          eq(teamJoinRequests.status, "accepted"),
        ))
        .limit(1)
        .then((rows) => rows[0] || null)
    : null;
  const needsTeamApproval = routeRequiresTeamApproval && !acceptedTeamApproval;
  if (needsTeamApproval && !selectedTeam?.leaderAgentId) {
    return NextResponse.json(
      { error: "The selected team is not accepting applications yet." },
      { status: 409 },
    );
  }
  if (needsTeamApproval && selectedTeam?.leaderAgentId) {
    const [activeLeader] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(
        eq(agents.id, selectedTeam.leaderAgentId),
        eq(agents.accountStatus, "active"),
      ))
      .limit(1);
    if (!activeLeader) {
      return NextResponse.json(
        { error: "The selected team is not accepting applications yet." },
        { status: 409 },
      );
    }
  }
  const profileSponsorId = acceptedTeamApproval
    ? agent.referredByAgentId
    : referredByAgentId;
  if (profileSponsorId === agent.id) {
    return NextResponse.json({ error: "An agent cannot sponsor themselves" }, { status: 400 });
  }
  if (profileSponsorId) {
    const [sponsor] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.id, profileSponsorId))
      .limit(1);
    if (!sponsor) return NextResponse.json({ error: "Sponsor not found" }, { status: 404 });
  }
  const legalName = cleanText(body.legalName) || agent.legalName || agent.name;
  const phone = cleanText(body.phone, 40) || agent.phone;
  const licenseNumber = cleanText(body.licenseNumber, 80) || agent.licenseNumber;
  const requestedLicensedCompany = cleanText(body.licensedCompany, 120) || agent.licensedCompany;
  const licensedEntity = resolveOnboardingESignEntity(requestedLicensedCompany);
  if (!licensedEntity) {
    return NextResponse.json(
      { error: "Select Homix Realty Inc. or Homix Living Inc." },
      { status: 400 },
    );
  }
  const licensedCompany = licensedEntity.legalName;
  const practice = body.practice === "rental" || body.practice === "sales" || body.practice === "both"
    ? body.practice
    : agent.practice;
  const now = new Date().toISOString();
  const teamTermsEffectiveFrom = now.slice(0, 10);
  let teamTermsConfig: typeof teamCompensationConfigs.$inferSelect | null = null;
  if (plan === "team_member" && teamId) {
    if (invitation?.teamCompensationConfigId) {
      [teamTermsConfig] = await db
        .select()
        .from(teamCompensationConfigs)
        .where(and(
          eq(teamCompensationConfigs.id, invitation.teamCompensationConfigId),
          eq(teamCompensationConfigs.teamId, teamId),
        ))
        .limit(1);
    } else if (acceptedTeamApproval && agent.teamTermsConfigId) {
      [teamTermsConfig] = await db
        .select()
        .from(teamCompensationConfigs)
        .where(and(
          eq(teamCompensationConfigs.id, agent.teamTermsConfigId),
          eq(teamCompensationConfigs.teamId, teamId),
        ))
        .limit(1);
    } else {
      [teamTermsConfig] = await db
        .select()
        .from(teamCompensationConfigs)
        .where(and(
          eq(teamCompensationConfigs.teamId, teamId),
          lte(teamCompensationConfigs.effectiveFrom, teamTermsEffectiveFrom),
        ))
        .orderBy(desc(teamCompensationConfigs.effectiveFrom), desc(teamCompensationConfigs.version))
        .limit(1);
    }
  }
  if (plan === "team_member" && !teamTermsConfig) {
    return NextResponse.json({ error: "The selected team has no active compensation terms." }, { status: 409 });
  }
  let outcome: {
    profile: typeof agents.$inferSelect;
    teamJoinRequest: typeof teamJoinRequests.$inferSelect | null;
    requiresTeamApproval: boolean;
    teamLeaderAgentId: number | null;
  };
  try {
    outcome = await db.transaction(async (tx) => {
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
          plan: agents.plan,
          teamId: agents.teamId,
          referredByAgentId: agents.referredByAgentId,
          teamTermsConfigId: agents.teamTermsConfigId,
          teamTermsEffectiveFrom: agents.teamTermsEffectiveFrom,
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
      const [pendingRequest] = await tx
        .select()
        .from(teamJoinRequests)
        .where(and(
          eq(teamJoinRequests.agentId, agent.id),
          eq(teamJoinRequests.status, "pending"),
        ))
        .limit(1);
      const mayReuseBoundRouting = canReuseAcceptedTeamRouting({
        requestedPlan: plan,
        requestedTeamId: selectedTeam?.id || null,
        currentPlan: boundAgent.plan,
        currentTeamId: boundAgent.teamId,
        currentConfigId: boundAgent.teamTermsConfigId,
      });
      const [acceptedRequest] = routeRequiresTeamApproval && selectedTeam && mayReuseBoundRouting
        ? await tx
            .select()
            .from(teamJoinRequests)
            .where(and(
              eq(teamJoinRequests.agentId, agent.id),
              eq(teamJoinRequests.teamId, selectedTeam.id),
              eq(teamJoinRequests.acceptedConfigId, boundAgent.teamTermsConfigId!),
              eq(teamJoinRequests.status, "accepted"),
            ))
            .limit(1)
        : [];
      if (acceptedTeamApproval && !acceptedRequest) {
        throw new OnboardingProfileConflict(
          "Team approval changed while saving. Reload the page and try again.",
        );
      }

      if (routeRequiresTeamApproval && !acceptedRequest && selectedTeam) {
        let teamJoinRequest: typeof teamJoinRequests.$inferSelect | null = pendingRequest || null;
        let eventType = "team_join_request_updated";
        if (pendingRequest && pendingRequest.teamId !== selectedTeam.id) {
          await tx
            .update(teamJoinRequests)
            .set({
              status: "superseded",
              decidedByAgentId: agent.id,
              decisionReason: "Applicant selected a different team.",
              decidedAt: now,
              updatedAt: now,
            })
            .where(eq(teamJoinRequests.id, pendingRequest.id));
          await tx.insert(onboardingEvents).values(onboardingEventValues({
            eventType: "team_join_superseded",
            actorAgentId: agent.id,
            actorEmail: agent.email,
            agentId: agent.id,
            teamJoinRequestId: pendingRequest.id,
            invitationId: pendingRequest.sourceInvitationId,
            teamId: pendingRequest.teamId,
            detail: { replacementTeamId: selectedTeam.id },
          }));
          teamJoinRequest = null;
        }
        if (teamJoinRequest) {
          [teamJoinRequest] = await tx
            .update(teamJoinRequests)
            .set({
              sponsorAgentId: referredByAgentId,
              sourceInvitationId: invitation?.id || boundAgent.onboardingInviteId,
              updatedAt: now,
            })
            .where(eq(teamJoinRequests.id, teamJoinRequest.id))
            .returning();
        } else {
          eventType = "team_join_requested";
          [teamJoinRequest] = await tx
            .insert(teamJoinRequests)
            .values({
              agentId: agent.id,
              teamId: selectedTeam.id,
              sponsorAgentId: referredByAgentId,
              sourceInvitationId: invitation?.id || boundAgent.onboardingInviteId,
              status: "pending",
              requestedAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
        }
        const [row] = await tx
          .update(agents)
          .set({
            legalName,
            phone,
            licenseNumber,
            licensedCompany,
            practice,
            plan: "solo",
            splitPct: PLAN_SPLIT_PCT.solo,
            teamId: null,
            referredByAgentId,
            affiliationTermMonths,
            planEffectiveFrom: null,
            teamTermsConfigId: null,
            teamTermsEffectiveFrom: null,
            teamTermsAcceptedAt: null,
            onboardingCompletedAt: null,
            onboardingStage: "team_review",
            onboardingSource: invitation?.source || boundAgent.onboardingSource || "direct",
            onboardingInviteId: invitation?.id || boundAgent.onboardingInviteId,
            paymentStatus: boundAgent.paymentStatus,
            updatedAt: now,
          })
          .where(eq(agents.id, agent.id))
          .returning();
        await tx.insert(onboardingEvents).values(onboardingEventValues({
          eventType,
          actorAgentId: agent.id,
          actorEmail: agent.email,
          agentId: agent.id,
          teamJoinRequestId: teamJoinRequest.id,
          invitationId: invitation?.id || boundAgent.onboardingInviteId,
          teamId: selectedTeam.id,
          detail: {
            sponsorAgentId: referredByAgentId,
            onboardingSource: invitation?.source || boundAgent.onboardingSource || "direct",
          },
        }));
        return {
          profile: row,
          teamJoinRequest,
          requiresTeamApproval: true,
          teamLeaderAgentId: selectedTeam.leaderAgentId,
        };
      }
      const effectiveReferredByAgentId = acceptedRequest
        ? boundAgent.referredByAgentId
        : referredByAgentId;
      const effectiveTeamConfigId = acceptedRequest?.acceptedConfigId || teamTermsConfig?.id || null;

      if (pendingRequest) {
        const replacementStatus = plan === "team_member" ? "superseded" : "cancelled";
        const replacementReason = plan === "team_member"
          ? "A pre-approved team invitation replaced this request."
          : "Applicant selected a non-team compensation plan.";
        await tx
          .update(teamJoinRequests)
          .set({
            status: replacementStatus,
            decidedByAgentId: agent.id,
            decisionReason: replacementReason,
            decidedAt: now,
            updatedAt: now,
          })
          .where(eq(teamJoinRequests.id, pendingRequest.id));
        await tx.insert(onboardingEvents).values(onboardingEventValues({
          eventType: replacementStatus === "cancelled"
            ? "team_join_cancelled"
            : "team_join_superseded",
          actorAgentId: agent.id,
          actorEmail: agent.email,
          agentId: agent.id,
          teamJoinRequestId: pendingRequest.id,
          invitationId: pendingRequest.sourceInvitationId,
          teamId: pendingRequest.teamId,
          detail: { reason: replacementReason },
        }));
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
          referredByAgentId: effectiveReferredByAgentId,
          affiliationTermMonths,
          planEffectiveFrom: boundAgent.planEffectiveFrom || now.slice(0, 10),
          anniversaryStart: boundAgent.anniversaryStart || boundAgent.joinedAt || now.slice(0, 10),
          teamTermsConfigId: effectiveTeamConfigId,
          teamTermsEffectiveFrom: effectiveTeamConfigId
            ? acceptedRequest
              ? boundAgent.teamTermsEffectiveFrom || teamTermsEffectiveFrom
              : teamTermsEffectiveFrom
            : null,
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
      await tx.insert(onboardingEvents).values(onboardingEventValues({
        eventType: "onboarding_profile_completed",
        actorAgentId: agent.id,
        actorEmail: agent.email,
        agentId: agent.id,
        invitationId: invitation?.id || boundAgent.onboardingInviteId,
        teamId: plan === "team_member" ? teamId : null,
        detail: {
          plan,
          sponsorAgentId: effectiveReferredByAgentId,
          teamCompensationConfigId: effectiveTeamConfigId,
          reusedAcceptedTeamRequestId: acceptedRequest?.id || null,
        },
      }));
      return {
        profile: row,
        teamJoinRequest: null,
        requiresTeamApproval: false,
        teamLeaderAgentId: null,
      };
    });
  } catch (error) {
    if (error instanceof OnboardingProfileConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Unable to save onboarding profile", error);
    return NextResponse.json({ error: "Unable to save onboarding profile." }, { status: 500 });
  }
  if (!outcome.profile) {
    return NextResponse.json({ error: "Unable to save onboarding profile." }, { status: 500 });
  }
  if (outcome.requiresTeamApproval && outcome.teamJoinRequest) {
    try {
      await notify({
        recipientAgentIds: outcome.teamLeaderAgentId ? [outcome.teamLeaderAgentId] : [],
        type: "team_join_requested",
        title: `团队加入申请：${agent.name}`,
        body: `${agent.email} 申请加入 ${selectedTeam?.name || "团队"}。介绍人归因不会因团队审批而改变。`,
        href: `/team-workspace?team=${selectedTeam?.id || ""}`,
        dedupeKey: `team-join-request:${outcome.teamJoinRequest.id}`,
        email: true,
      });
    } catch (error) {
      console.error("team join request notification failed", error);
    }
    return NextResponse.json({
      profile: outcome.profile,
      teamJoinRequest: outcome.teamJoinRequest,
      requiresTeamApproval: true,
    }, { status: 202 });
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
  return NextResponse.json({ profile: outcome.profile, requiresTeamApproval: false });
}
