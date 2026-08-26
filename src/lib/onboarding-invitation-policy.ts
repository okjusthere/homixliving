import type { InvitationKind } from "@/lib/onboarding-routing";

export type InvitationSponsorCandidate = {
  id: number;
  teamId: number | null;
  accountStatus: "pending" | "active" | "inactive";
};

export function canAssignInvitationSponsor(input: {
  kind: InvitationKind;
  isAdmin: boolean;
  actorAgentId: number;
  targetTeamId: number | null;
  targetTeamLeaderId: number | null;
  candidate: InvitationSponsorCandidate | null;
}) {
  const { candidate } = input;
  if (!candidate || candidate.accountStatus !== "active") return false;
  if (input.kind === "personal_referral") {
    return candidate.id === input.actorAgentId;
  }
  if (input.isAdmin) return true;
  if (input.kind !== "team_recruiting" || input.targetTeamId == null) return false;
  return candidate.teamId === input.targetTeamId || candidate.id === input.targetTeamLeaderId;
}
