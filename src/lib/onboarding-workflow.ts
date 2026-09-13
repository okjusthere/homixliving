import type { Agent } from "@/db/schema";
import { onboardingAgreementAllowsPayment } from "@/lib/onboarding";
import { verifiedManualContract, type ManualContractBasis } from "@/lib/onboarding-requirements";

export function onboardingWorkflow(
  agent: Pick<
    Agent,
    | "accountStatus"
    | "onboardingCompletedAt"
    | "agreementAgentSignedAt"
    | "agreementCountersignedAt"
    | "agreementStatus"
    | "signingRequestId"
    | "paymentStatus"
    | "plan"
    | "teamId"
    | "teamTermsConfigId"
    | "teamTermsAcceptedAt"
  > & ManualContractBasis,
  paymentChannel: string | null,
  pendingTeam = false,
) {
  const signed = onboardingAgreementAllowsPayment(agent);
  const teamReady =
    !pendingTeam &&
    (agent.plan !== "team_member" ||
      Boolean(
        agent.teamId && agent.teamTermsConfigId && agent.teamTermsAcceptedAt,
      ));
  const profileReady = Boolean(agent.onboardingCompletedAt);
  const manual = verifiedManualContract(agent);
  const countersignPending = manual ? !manual.companySignedAt : Boolean(
    agent.signingRequestId &&
    agent.agreementAgentSignedAt &&
    !agent.agreementCountersignedAt &&
    agent.agreementStatus !== "completed",
  );
  // Recording money never asserts eligibility, creates benefits or activates.
  const canRecordPayment = true;
  const canApprove =
    agent.accountStatus === "pending" &&
    profileReady &&
    signed &&
    teamReady &&
    agent.paymentStatus === "paid" &&
    paymentChannel === "offline";
  const next: keyof typeof ONBOARDING_NEXT =
    agent.accountStatus === "inactive"
      ? "inactive"
      : agent.accountStatus === "active"
        ? countersignPending
          ? "countersign"
          : "complete"
        : !profileReady
          ? "profile"
          : pendingTeam
            ? "team"
            : !signed
              ? ["declined", "expired", "voided", "failed"].includes(
                  agent.agreementStatus,
                )
                ? "agreement_issue"
                : "signature"
              : !teamReady
                ? "team"
                : agent.paymentStatus !== "paid"
                  ? "payment"
                  : paymentChannel === "offline"
                    ? "approval"
                    : paymentChannel === "stripe"
                      ? "activation"
                      : "payment_issue";
  return {
    signed,
    profileReady,
    teamReady,
    countersignPending,
    canRecordPayment,
    canApprove,
    next,
  };
}

export const ONBOARDING_NEXT = {
  profile: ["待本人完善资料", "Agent: complete profile"],
  team: ["待团队确认 / 条款确认", "Team decision / terms required"],
  signature: ["待本人签署", "Agent: sign agreement"],
  agreement_issue: ["签约需处理", "Agreement needs attention"],
  payment: ["待付款 / 线下收款核验", "Payment / offline verification"],
  approval: ["待管理员审批开通", "Admin: approve access"],
  activation: ["线上已付，待自动开通", "Online payment: activation pending"],
  payment_issue: ["需核对付款记录", "Payment record needs review"],
  countersign: ["已开通 · 待公司会签", "Active · company signature due"],
  complete: ["入职完成", "Onboarding complete"],
  inactive: ["账号已停用", "Account inactive"],
} as const;

export type OnboardingWorkflow = ReturnType<typeof onboardingWorkflow>;
