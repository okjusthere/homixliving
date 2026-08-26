import type {
  AgentAccountStatus,
  OnboardingAgreementStatus,
  TeamLeaderApplicationStatus,
  TeamLifecycleStatus,
} from "@/db/schema";
import type { AgentPlan } from "@/lib/agent-plans";
import { isTeamSplitPreset } from "@/lib/team-compensation-policy";

export const TEAM_LEADER_APPLICATION_MEMBER_MIN = 1;
export const TEAM_LEADER_APPLICATION_MEMBER_MAX = 500;

export function validateTeamLeaderApplicationInput(input: {
  proposedTeamName: unknown;
  expectedMemberCount: unknown;
  positioning: unknown;
  proposedTeamSplitPct: unknown;
}) {
  const proposedTeamName = String(input.proposedTeamName || "").trim();
  const expectedMemberCount = Number(input.expectedMemberCount);
  const positioning = String(input.positioning || "").trim();
  const proposedTeamSplitPct = Number(input.proposedTeamSplitPct);
  if (proposedTeamName.length < 2 || proposedTeamName.length > 100) {
    throw new Error("Team name must be between 2 and 100 characters.");
  }
  if (
    !Number.isInteger(expectedMemberCount) ||
    expectedMemberCount < TEAM_LEADER_APPLICATION_MEMBER_MIN ||
    expectedMemberCount > TEAM_LEADER_APPLICATION_MEMBER_MAX
  ) {
    throw new Error("Expected member count must be between 1 and 500.");
  }
  if (positioning.length < 10 || positioning.length > 1200) {
    throw new Error("Team positioning must be between 10 and 1,200 characters.");
  }
  if (!isTeamSplitPreset(proposedTeamSplitPct)) {
    throw new Error("Proposed Team Split must be 10%, 15%, or 20%.");
  }
  return { proposedTeamName, expectedMemberCount, positioning, proposedTeamSplitPct };
}

export function teamLeaderApplicationEligibility(input: {
  accountStatus: AgentAccountStatus;
  agentAgreementStatus: OnboardingAgreementStatus;
  plan: AgentPlan;
  licensedCompanySupported: boolean;
  alreadyLeadsTeam: boolean;
  openApplicationStatus?: TeamLeaderApplicationStatus | null;
}) {
  if (input.accountStatus !== "active") return "account_not_active" as const;
  if (!input.licensedCompanySupported) return "licensed_company_required" as const;
  if (input.agentAgreementStatus !== "completed") return "agent_agreement_required" as const;
  if (input.plan !== "solo_pro") return "solo_pro_required" as const;
  if (input.alreadyLeadsTeam) return "already_team_leader" as const;
  if (input.openApplicationStatus === "submitted" || input.openApplicationStatus === "approved") {
    return "application_already_open" as const;
  }
  return null;
}

export function canCreateTeamRecruitingInvitation(input: {
  teamStatus: TeamLifecycleStatus;
  leaderAgreementStatus?: OnboardingAgreementStatus | null;
}) {
  if (input.teamStatus === "inactive") return false;
  if (input.teamStatus === "active") return true;
  return input.leaderAgreementStatus === "completed";
}

export function shouldActivateFormingTeam(input: {
  teamStatus: TeamLifecycleStatus;
  leaderAgreementStatus: OnboardingAgreementStatus;
  memberAgreementStatus: OnboardingAgreementStatus;
}) {
  return input.teamStatus === "forming" &&
    input.leaderAgreementStatus === "completed" &&
    input.memberAgreementStatus === "completed";
}
