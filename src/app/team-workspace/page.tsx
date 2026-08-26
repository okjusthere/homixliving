import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  onboardingInvitations,
  teamCompensationConfigs,
  teamJoinRequests,
  teamLeaderApplications,
  teams,
} from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import {
  recruitingInvitationState,
  teamRecruitingStage,
  type TeamWorkspaceData,
} from "@/lib/team-workspace";
import { TeamWorkspaceClient } from "./team-workspace-client";

export const metadata: Metadata = { title: "Team workspace · Homix" };

export default async function TeamWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string | string[] }>;
}) {
  const session = await requireActiveAgent();
  const agentId = session.user.agentId;
  if (!agentId) redirect("/");

  const availableTeams = session.user.isAdmin
    ? await db.select().from(teams).orderBy(teams.name)
    : await db
        .select()
        .from(teams)
        .where(eq(teams.leaderAgentId, agentId))
        .orderBy(teams.name);
  if (!availableTeams.length) redirect("/");

  const query = await searchParams;
  const requestedId = Number(Array.isArray(query.team) ? query.team[0] : query.team);
  const selectedTeam = availableTeams.find((team) => team.id === requestedId) || availableTeams[0];
  const today = new Date().toISOString().slice(0, 10);

  const [memberRows, configRows, invitationRows, joinRequestRows] = await Promise.all([
    db.select().from(agents).where(eq(agents.teamId, selectedTeam.id)).orderBy(agents.name),
    db
      .select()
      .from(teamCompensationConfigs)
      .where(eq(teamCompensationConfigs.teamId, selectedTeam.id))
      .orderBy(desc(teamCompensationConfigs.effectiveFrom), desc(teamCompensationConfigs.version)),
    db
      .select()
      .from(onboardingInvitations)
      .where(and(
        eq(onboardingInvitations.teamId, selectedTeam.id),
        eq(onboardingInvitations.kind, "team_recruiting"),
      ))
      .orderBy(desc(onboardingInvitations.createdAt))
      .limit(60),
    db
      .select({
        request: teamJoinRequests,
        candidateName: agents.name,
        candidateEmail: agents.email,
      })
      .from(teamJoinRequests)
      .innerJoin(agents, eq(agents.id, teamJoinRequests.agentId))
      .where(eq(teamJoinRequests.teamId, selectedTeam.id))
      .orderBy(desc(teamJoinRequests.createdAt))
      .limit(60),
  ]);
  const [leaderApplication] = await db
    .select()
    .from(teamLeaderApplications)
    .where(and(
      eq(teamLeaderApplications.teamId, selectedTeam.id),
      inArray(teamLeaderApplications.status, ["approved", "active"]),
    ))
    .limit(1);

  const invitationIds = invitationRows.map((invite) => invite.id);
  const inviteCandidateRows = invitationIds.length
    ? await db
        .select()
        .from(agents)
        .where(inArray(agents.onboardingInviteId, invitationIds))
        .orderBy(desc(agents.updatedAt))
    : [];
  const candidateById = new Map(
    [...memberRows.filter((agent) => agent.accountStatus === "pending"), ...inviteCandidateRows]
      .map((agent) => [agent.id, agent]),
  );
  const allRelevantAgents = [...memberRows, ...candidateById.values()];
  const relatedAgentIds = new Set<number>([
    ...(selectedTeam.leaderAgentId ? [selectedTeam.leaderAgentId] : []),
    ...invitationRows.flatMap((invite) => invite.sponsorAgentId ? [invite.sponsorAgentId] : []),
    ...joinRequestRows.flatMap(({ request }) => request.sponsorAgentId ? [request.sponsorAgentId] : []),
    ...allRelevantAgents.flatMap((agent) => agent.referredByAgentId ? [agent.referredByAgentId] : []),
  ]);
  const relatedAgents = relatedAgentIds.size
    ? await db
        .select({ id: agents.id, name: agents.name, accountStatus: agents.accountStatus })
        .from(agents)
        .where(inArray(agents.id, [...relatedAgentIds]))
    : [];
  const nameByAgentId = new Map([
    ...memberRows.map((agent) => [agent.id, agent.name] as const),
    ...relatedAgents.map((agent) => [agent.id, agent.name] as const),
  ]);
  const configById = new Map(configRows.map((config) => [config.id, config]));
  const currentConfig = configRows.find((config) => config.effectiveFrom <= today) || null;
  const futureConfigs = configRows.filter((config) => config.effectiveFrom > today);
  const scheduledConfig = futureConfigs.at(-1) || null;
  const inviteById = new Map(invitationRows.map((invite) => [invite.id, invite]));
  const sponsorCandidates = new Map<number, string>();
  for (const member of memberRows) {
    if (member.accountStatus === "active") sponsorCandidates.set(member.id, member.name);
  }
  if (selectedTeam.leaderAgentId) {
    const leader = relatedAgents.find((agent) => agent.id === selectedTeam.leaderAgentId)
      || memberRows.find((agent) => agent.id === selectedTeam.leaderAgentId);
    if (leader?.accountStatus === "active") sponsorCandidates.set(leader.id, leader.name);
  }

  const configs = configRows.map((config) => ({
    id: config.id,
    version: config.version,
    effectiveFrom: config.effectiveFrom,
    defaultTeamSplitPct: config.defaultTeamSplitPct,
    teamLeadSplitPct: config.teamLeadSplitPct,
    teamCapCents: config.teamCapCents,
    createdAt: config.createdAt,
  }));
  const data: TeamWorkspaceData = {
    teams: availableTeams.map((team) => ({ id: team.id, name: team.name })),
    team: {
      id: selectedTeam.id,
      name: selectedTeam.name,
      leaderAgentId: selectedTeam.leaderAgentId,
      status: selectedTeam.status,
    },
    leaderApplication: leaderApplication ? {
      id: leaderApplication.id,
      status: leaderApplication.status as "approved" | "active",
      agreementStatus: leaderApplication.agreementStatus,
      agreementCompletedAt: leaderApplication.agreementCompletedAt,
    } : null,
    leaderName: selectedTeam.leaderAgentId
      ? nameByAgentId.get(selectedTeam.leaderAgentId) || null
      : null,
    counts: {
      active: memberRows.filter((agent) => agent.accountStatus === "active").length,
      pending:
        [...candidateById.values()].filter((agent) => agent.accountStatus === "pending").length +
        joinRequestRows.filter(({ request }) => request.status === "pending").length,
      inactive: memberRows.filter((agent) => agent.accountStatus === "inactive").length,
    },
    currentConfig: currentConfig ? configs.find((config) => config.id === currentConfig.id) || null : null,
    scheduledConfig: scheduledConfig ? configs.find((config) => config.id === scheduledConfig.id) || null : null,
    configs,
    sponsorCandidates: [...sponsorCandidates].map(([id, name]) => ({ id, name })),
    joinRequests: joinRequestRows.map(({ request, candidateName, candidateEmail }) => ({
      id: request.id,
      agentId: request.agentId,
      name: candidateName,
      email: candidateEmail,
      sponsorName: request.sponsorAgentId
        ? nameByAgentId.get(request.sponsorAgentId) || null
        : null,
      status: request.status,
      requestedAt: request.requestedAt,
      decidedAt: request.decidedAt,
      decisionReason: request.decisionReason,
      acceptedConfigVersion: request.acceptedConfigId
        ? configById.get(request.acceptedConfigId)?.version || null
        : null,
    })),
    members: memberRows.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      accountStatus: member.accountStatus,
      sponsorName: member.referredByAgentId
        ? nameByAgentId.get(member.referredByAgentId) || null
        : null,
      joinedAt: member.joinedAt,
      configVersion: member.teamTermsConfigId
        ? configById.get(member.teamTermsConfigId)?.version || null
        : null,
      onboardingComplete: Boolean(member.onboardingCompletedAt),
    })),
    candidates: [...candidateById.values()].map((candidate) => {
      const invite = candidate.onboardingInviteId
        ? inviteById.get(candidate.onboardingInviteId)
        : null;
      const sponsorId = candidate.referredByAgentId || invite?.sponsorAgentId || null;
      return {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        stage: teamRecruitingStage(candidate),
        sponsorName: sponsorId ? nameByAgentId.get(sponsorId) || null : null,
        updatedAt: candidate.updatedAt,
      };
    }),
    invitations: invitationRows.map((invite) => ({
      id: invite.id,
      email: invite.email,
      sponsorAgentId: invite.sponsorAgentId,
      sponsorName: invite.sponsorAgentId
        ? nameByAgentId.get(invite.sponsorAgentId) || null
        : null,
      source: invite.source,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      useCount: invite.useCount,
      maxUses: invite.maxUses,
      revokedAt: invite.revokedAt,
      state: recruitingInvitationState(invite),
      configVersion: invite.teamCompensationConfigId
        ? configById.get(invite.teamCompensationConfigId)?.version || null
        : null,
    })),
  };

  return <TeamWorkspaceClient data={data} isAdmin={session.user.isAdmin} />;
}
