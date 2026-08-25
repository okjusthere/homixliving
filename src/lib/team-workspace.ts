import type {
  AgentAccountStatus,
  OnboardingAgreementStatus,
  OnboardingPaymentStatus,
  OnboardingStage,
} from "@/db/schema";

export type TeamRecruitingStage =
  | "profile"
  | "agreement"
  | "payment"
  | "review"
  | "complete"
  | "attention"
  | "inactive";

export function teamRecruitingStage(input: {
  accountStatus: AgentAccountStatus;
  onboardingStage: OnboardingStage;
  agreementStatus: OnboardingAgreementStatus;
  paymentStatus: OnboardingPaymentStatus;
}): TeamRecruitingStage {
  if (input.accountStatus === "active") return "complete";
  if (input.accountStatus === "inactive") return "inactive";
  if (["declined", "voided", "expired", "failed"].includes(input.agreementStatus)) {
    return "attention";
  }
  if (input.onboardingStage === "profile") return "profile";
  if (input.agreementStatus !== "completed") return "agreement";
  if (input.paymentStatus === "pending") return "payment";
  return "review";
}

export type RecruitingInvitationState = "active" | "used" | "expired" | "revoked";

export function recruitingInvitationState(input: {
  revokedAt: string | null;
  expiresAt: string;
  useCount: number;
  maxUses: number;
}, now = new Date()): RecruitingInvitationState {
  if (input.revokedAt) return "revoked";
  if (new Date(input.expiresAt).getTime() <= now.getTime()) return "expired";
  if (input.useCount >= input.maxUses) return "used";
  return "active";
}

export type TeamWorkspaceData = {
  teams: Array<{ id: number; name: string }>;
  team: { id: number; name: string; leaderAgentId: number | null };
  leaderName: string | null;
  counts: { active: number; pending: number; inactive: number };
  currentConfig: TeamWorkspaceConfig | null;
  scheduledConfig: TeamWorkspaceConfig | null;
  configs: TeamWorkspaceConfig[];
  sponsorCandidates: Array<{ id: number; name: string }>;
  members: Array<{
    id: number;
    name: string;
    email: string;
    accountStatus: AgentAccountStatus;
    sponsorName: string | null;
    joinedAt: string | null;
    configVersion: number | null;
    onboardingComplete: boolean;
  }>;
  candidates: Array<{
    id: number;
    name: string;
    email: string;
    stage: TeamRecruitingStage;
    sponsorName: string | null;
    updatedAt: string | null;
  }>;
  invitations: Array<{
    id: number;
    email: string | null;
    sponsorAgentId: number | null;
    sponsorName: string | null;
    source: string;
    createdAt: string | null;
    expiresAt: string;
    useCount: number;
    maxUses: number;
    revokedAt: string | null;
    state: RecruitingInvitationState;
    configVersion: number | null;
  }>;
};

export type TeamWorkspaceConfig = {
  id: number;
  version: number;
  effectiveFrom: string;
  defaultTeamSplitPct: number;
  teamLeadSplitPct: number;
  teamCapCents: number | null;
  createdAt: string | null;
};
