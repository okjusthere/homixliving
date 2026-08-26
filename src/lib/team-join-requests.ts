import type { AgentPlan } from "@/lib/agent-plans";
import type { InvitationRouting } from "@/lib/onboarding-routing";

export function hasPreapprovedTeamRouting(
  invitation: (InvitationRouting & { kind?: string | null }) | null | undefined,
  teamId: number | null,
) {
  return Boolean(
    invitation &&
    invitation.plan === "team_member" &&
    invitation.lockPlan &&
    invitation.lockTeam &&
    invitation.teamId === teamId,
  );
}

export function requiresTeamJoinApproval(input: {
  plan: AgentPlan;
  teamId: number | null;
  invitation?: (InvitationRouting & { kind?: string | null }) | null;
}) {
  return input.plan === "team_member" &&
    input.teamId != null &&
    !hasPreapprovedTeamRouting(input.invitation, input.teamId);
}

export function canReuseAcceptedTeamRouting(input: {
  requestedPlan: AgentPlan;
  requestedTeamId: number | null;
  currentPlan: AgentPlan;
  currentTeamId: number | null;
  currentConfigId: number | null;
}) {
  return input.requestedPlan === "team_member" &&
    input.requestedTeamId != null &&
    input.currentPlan === "team_member" &&
    input.currentTeamId === input.requestedTeamId &&
    input.currentConfigId != null;
}

export function canDecideTeamJoinRequest(input: {
  isAdmin: boolean;
  actorAgentId: number;
  teamLeaderAgentId: number | null;
}) {
  return input.isAdmin || input.teamLeaderAgentId === input.actorAgentId;
}

export function teamDeletionBlocker(input: {
  hasMembers: boolean;
  hasApplications: boolean;
}) {
  if (input.hasMembers) return "has_members" as const;
  if (input.hasApplications) return "has_applications" as const;
  return null;
}
