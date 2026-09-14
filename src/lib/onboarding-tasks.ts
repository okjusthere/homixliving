import type { Agent } from "@/db/schema";
import type {
  OnboardingAccessGrant,
  OnboardingContract,
  OnboardingReceipt,
} from "@/db/onboarding-schema";
import { dbTimeMs } from "@/lib/db-time";
import { onboardingWorkflow } from "@/lib/onboarding-workflow";

export const TASK_LABELS = {
  profile: ["待完善资料", "Complete profile"],
  signature: ["待本人签署", "Agent signature due"],
  issues: ["签约异常 / 核验失效", "Contract needs attention"],
  countersign: ["待公司会签", "Company signature due"],
  payment: ["待付款", "Payment due"],
  offline: ["可以审批开通", "Ready for approval"],
  close_online: ["取消已不用的线上邀请", "Close unused online invitations"],
  contract_review: ["线下合同待核验", "Verify uploaded contract"],
  receipt: ["收款待匹配", "Reconcile receipt"],
  exception: ["例外待补齐", "Temporary access · requirements due"],
  expired: ["例外已到期", "Temporary access expired"],
  team: ["团队 / 条款待确认", "Team / terms due"],
  activation: ["付款后开通需检查", "Check paid activation"],
  website: ["账号已开通 · 官网同步待重试", "Active · retry website sync"],
  finance: ["Stripe 实收款待财务核对", "Stripe payment needs reconciliation"],
} as const;
export type OnboardingTaskKey = keyof typeof TASK_LABELS;
export type OnboardingTaskSummary = {
  tasks: OnboardingTaskKey[];
  priority: number;
  deferred: boolean;
};

export function onboardingTasks(
  agent: Agent,
  channel: string | null,
  records: {
    contracts: Pick<OnboardingContract, "status">[];
    receipts: Pick<OnboardingReceipt, "status">[];
    grants: Pick<OnboardingAccessGrant, "status" | "expiresAt">[];
    staleSettlements?: { id: number }[];
  },
  pendingTeam = false,
  now = Date.now(),
): OnboardingTaskSummary {
  const workflow = onboardingWorkflow(agent, channel, pendingTeam);
  const tasks = new Set<OnboardingTaskKey>();
  if (records.staleSettlements?.length) tasks.add("finance");
  if (agent.accountStatus === "active" && agent.onboardingWebsiteSync?.status === "pending") tasks.add("website");
  if (agent.accountStatus === "pending") {
    if (!workflow.profileReady) tasks.add("profile");
    if (!workflow.signed)
      tasks.add(
        ["declined", "expired", "voided", "failed"].includes(
          agent.agreementStatus,
        )
          ? "issues"
          : "signature",
      );
    if (!workflow.teamReady) tasks.add("team");
    if (agent.paymentStatus === "pending") tasks.add("payment");
    if (workflow.canApprove) tasks.add("offline");
    if (workflow.next === "activation" || workflow.next === "payment_issue")
      tasks.add("activation");
  }
  if (
    (agent.onboardingSigningClosure?.requestId === agent.signingRequestId &&
      agent.onboardingSigningClosure?.status !== "completed") ||
    (agent.onboardingManualContract &&
      agent.signingRequestId &&
      ["preparing", "sent", "expired"].includes(agent.agreementStatus))
  )
    tasks.add("close_online");
  if (workflow.countersignPending) tasks.add("countersign");
  if (records.contracts.some((c) => c.status === "uploaded"))
    tasks.add("contract_review");
  if (
    agent.accountStatus === "active" &&
    !workflow.signed &&
    (Boolean(agent.signingRequestId) ||
      records.contracts.some(
        (c) => c.status === "revoked" || c.status === "accepted",
      ))
  )
    tasks.add("issues");
  if (records.receipts.some((r) => r.status === "unmatched"))
    tasks.add("receipt");
  if (agent.accountStatus !== "active")
    for (const grant of records.grants) {
      if (grant.status === "open")
        tasks.add(
          (dbTimeMs(grant.expiresAt) ?? 0) <= now ? "expired" : "exception",
        );
    }
  const priority = tasks.has("expired")
    ? 0
    : [
          "contract_review",
          "receipt",
          "finance",
          "offline",
          "issues",
          "activation",
          "close_online",
        ].some((key) => tasks.has(key as OnboardingTaskKey))
      ? 1
      : 2;
  return {
    tasks: [...tasks],
    priority,
    deferred: Boolean(agent.onboardingDisposition),
  };
}
