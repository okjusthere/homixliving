import type { AgentPlan } from "@/lib/agent-plans";

export type InvitationKind = "personal_referral" | "team_recruiting" | "admin";

export type RoutingLocks = {
  plan: boolean;
  team: boolean;
  sponsor: boolean;
  term: boolean;
};

export type InvitationRouting = {
  plan: AgentPlan;
  teamId: number | null;
  sponsorAgentId: number | null;
  affiliationTermMonths: number;
  lockPlan: boolean;
  lockTeam: boolean;
  lockSponsor: boolean;
  lockTerm: boolean;
};

export type RequestedRouting = {
  plan: AgentPlan;
  teamId: number | null;
  sponsorAgentId: number | null;
  affiliationTermMonths: number;
};

export function invitationLocks(invitation?: InvitationRouting | null): RoutingLocks {
  return {
    plan: Boolean(invitation?.lockPlan),
    team: Boolean(invitation?.lockTeam),
    sponsor: Boolean(invitation?.lockSponsor),
    term: Boolean(invitation?.lockTerm),
  };
}

export function applyInvitationRouting(
  requested: RequestedRouting,
  invitation?: InvitationRouting | null,
): RequestedRouting {
  if (!invitation) return requested;
  const locks = invitationLocks(invitation);
  const plan = locks.plan ? invitation.plan : requested.plan;
  return {
    plan,
    teamId: plan === "team_member"
      ? locks.team ? invitation.teamId : requested.teamId
      : null,
    sponsorAgentId: locks.sponsor ? invitation.sponsorAgentId : requested.sponsorAgentId,
    affiliationTermMonths: plan === "solo_pro"
      ? 12
      : locks.term ? invitation.affiliationTermMonths : requested.affiliationTermMonths,
  };
}

export function defaultInvitationLocks(
  kind: InvitationKind,
  fields?: { teamId?: number | null; sponsorAgentId?: number | null },
): RoutingLocks {
  if (kind === "personal_referral") {
    return { plan: false, team: false, sponsor: true, term: false };
  }
  if (kind === "team_recruiting") {
    return { plan: true, team: true, sponsor: true, term: true };
  }
  return {
    plan: true,
    team: Boolean(fields?.teamId),
    sponsor: Boolean(fields?.sponsorAgentId),
    term: true,
  };
}
