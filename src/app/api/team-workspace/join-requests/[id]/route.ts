import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  onboardingEvents,
  teamCompensationConfigs,
  teamJoinRequests,
  teams,
} from "@/db/schema";
import { PLAN_SPLIT_PCT } from "@/lib/agent-plans";
import { lockOnboardingAgent, lockTeamConfiguration } from "@/lib/advisory-locks";
import { logAudit } from "@/lib/audit";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { notify } from "@/lib/notify";
import { onboardingEventValues } from "@/lib/onboarding-events";
import { canDecideTeamJoinRequest } from "@/lib/team-join-requests";

class TeamJoinDecisionConflict extends Error {}

function cleanReason(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, 500) : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  const actorAgentId = auth.session.user.agentId;
  if (!actorAgentId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const requestId = Number((await params).id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return NextResponse.json({ error: "Invalid team join request" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const action = body.action === "accept" || body.action === "decline" ? body.action : null;
  const decisionReason = cleanReason(body.reason);
  if (!action) {
    return NextResponse.json({ error: "Action must be accept or decline" }, { status: 400 });
  }
  if (action === "decline" && !decisionReason) {
    return NextResponse.json({ error: "A decline reason is required" }, { status: 400 });
  }

  const [initialRequest] = await db
    .select({
      id: teamJoinRequests.id,
      teamId: teamJoinRequests.teamId,
      agentId: teamJoinRequests.agentId,
      teamName: teams.name,
      teamLeaderAgentId: teams.leaderAgentId,
    })
    .from(teamJoinRequests)
    .innerJoin(teams, eq(teams.id, teamJoinRequests.teamId))
    .where(eq(teamJoinRequests.id, requestId))
    .limit(1);
  if (!initialRequest) {
    return NextResponse.json({ error: "Team join request not found" }, { status: 404 });
  }
  if (!canDecideTeamJoinRequest({
    isAdmin: auth.session.user.isAdmin,
    actorAgentId,
    teamLeaderAgentId: initialRequest.teamLeaderAgentId,
  })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let result: {
    request: typeof teamJoinRequests.$inferSelect;
    agent: typeof agents.$inferSelect;
    configVersion: number | null;
  };
  try {
    result = await db.transaction(async (tx) => {
      await lockOnboardingAgent(tx, initialRequest.agentId);
      await lockTeamConfiguration(tx, initialRequest.teamId);
      const [freshRequest] = await tx
        .select()
        .from(teamJoinRequests)
        .where(eq(teamJoinRequests.id, requestId))
        .limit(1);
      const [freshTeam] = await tx
        .select()
        .from(teams)
        .where(eq(teams.id, initialRequest.teamId))
        .limit(1);
      const [candidate] = await tx
        .select()
        .from(agents)
        .where(eq(agents.id, initialRequest.agentId))
        .limit(1);
      if (!freshRequest || !freshTeam || !candidate) {
        throw new TeamJoinDecisionConflict("The request is no longer available.");
      }
      if (!canDecideTeamJoinRequest({
        isAdmin: auth.session.user.isAdmin,
        actorAgentId,
        teamLeaderAgentId: freshTeam.leaderAgentId,
      })) {
        throw new TeamJoinDecisionConflict("You no longer manage this team.");
      }
      if (freshRequest.status !== "pending") {
        throw new TeamJoinDecisionConflict("This request has already been decided.");
      }
      if (candidate.accountStatus !== "pending" || candidate.agreementStatus !== "not_started") {
        throw new TeamJoinDecisionConflict(
          "The applicant is no longer eligible for a team decision.",
        );
      }
      if (!freshTeam.companyId || candidate.licensedCompanyId !== freshTeam.companyId) {
        throw new TeamJoinDecisionConflict(
          "The applicant and team must belong to the same licensed company.",
        );
      }

      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      let acceptedConfig: typeof teamCompensationConfigs.$inferSelect | null = null;
      if (action === "accept") {
        [acceptedConfig] = await tx
          .select()
          .from(teamCompensationConfigs)
          .where(and(
            eq(teamCompensationConfigs.teamId, freshTeam.id),
            lte(teamCompensationConfigs.effectiveFrom, today),
          ))
          .orderBy(
            desc(teamCompensationConfigs.effectiveFrom),
            desc(teamCompensationConfigs.version),
          )
          .limit(1);
        if (!acceptedConfig) {
          throw new TeamJoinDecisionConflict(
            "Publish team compensation terms before accepting applicants.",
          );
        }
      }

      const [decidedRequest] = await tx
        .update(teamJoinRequests)
        .set({
          status: action === "accept" ? "accepted" : "declined",
          acceptedConfigId: acceptedConfig?.id || null,
          decidedByAgentId: actorAgentId,
          decisionReason,
          decidedAt: now,
          updatedAt: now,
        })
        .where(and(
          eq(teamJoinRequests.id, requestId),
          eq(teamJoinRequests.status, "pending"),
        ))
        .returning();
      if (!decidedRequest) {
        throw new TeamJoinDecisionConflict("This request has already been decided.");
      }

      const [updatedAgent] = await tx
        .update(agents)
        .set(action === "accept" ? {
          plan: "team_member",
          splitPct: PLAN_SPLIT_PCT.team_member,
          teamId: freshTeam.id,
          affiliationTermMonths: candidate.affiliationTermMonths || 12,
          planEffectiveFrom: candidate.planEffectiveFrom || today,
          anniversaryStart: candidate.anniversaryStart || candidate.joinedAt || today,
          teamTermsConfigId: acceptedConfig!.id,
          teamTermsEffectiveFrom: today,
          teamTermsAcceptedAt: null,
          onboardingCompletedAt: now,
          onboardingStage: "agreement",
          updatedAt: now,
        } : {
          plan: "solo",
          splitPct: PLAN_SPLIT_PCT.solo,
          teamId: null,
          teamTermsConfigId: null,
          teamTermsEffectiveFrom: null,
          teamTermsAcceptedAt: null,
          onboardingCompletedAt: null,
          onboardingStage: "profile",
          updatedAt: now,
        })
        .where(eq(agents.id, candidate.id))
        .returning();

      await tx.insert(onboardingEvents).values(onboardingEventValues({
        eventType: action === "accept" ? "team_join_accepted" : "team_join_declined",
        session: auth.session,
        agentId: candidate.id,
        teamJoinRequestId: decidedRequest.id,
        invitationId: decidedRequest.sourceInvitationId,
        teamId: freshTeam.id,
        detail: {
          decisionReason,
          sponsorAgentId: candidate.referredByAgentId,
          acceptedConfigId: acceptedConfig?.id || null,
          acceptedConfigVersion: acceptedConfig?.version || null,
        },
      }));
      return {
        request: decidedRequest,
        agent: updatedAgent,
        configVersion: acceptedConfig?.version || null,
      };
    });
  } catch (error) {
    if (error instanceof TeamJoinDecisionConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Unable to decide team join request", error);
    return NextResponse.json({ error: "Unable to decide team join request" }, { status: 500 });
  }

  await logAudit(
    auth.session,
    action === "accept" ? "accept" : "decline",
    "team_join_request",
    result.request.id,
    `${initialRequest.teamName}: ${result.agent.name} ${action === "accept" ? "accepted" : "declined"}`,
    {
      agentId: result.agent.id,
      teamId: initialRequest.teamId,
      sponsorAgentId: result.agent.referredByAgentId,
      configVersion: result.configVersion,
      decisionReason,
    },
  );
  try {
    await notify({
      recipientAgentIds: [result.agent.id],
      type: action === "accept" ? "team_join_accepted" : "team_join_declined",
      title: action === "accept"
        ? `团队申请已接受：${initialRequest.teamName}`
        : `团队申请未通过：${initialRequest.teamName}`,
      body: action === "accept"
        ? `团队条款版本 v${result.configVersion} 已锁定，请继续签署入职协议。`
        : decisionReason || "请返回入职页面选择其他方案。",
      href: "/pending",
      dedupeKey: `team-join-decision:${result.request.id}:${action}`,
      email: true,
    });
  } catch (error) {
    console.error("team join decision notification failed", error);
  }
  return NextResponse.json({
    request: result.request,
    profile: result.agent,
    configVersion: result.configVersion,
  });
}
