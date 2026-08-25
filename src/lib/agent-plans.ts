/**
 * Commission plan and practice area — the two things an admin most often needs
 * to adjust on an existing agent.
 *
 * v3.1 treats plans as effective-dated compensation tracks. `splitPct` remains
 * as a compatibility projection for older views; new transactions use the
 * versioned plan and team configuration instead.
 */

export type AgentPlan =
  | "solo"
  | "solo_pro"
  | "team_member"
  | "team_leader"
  | "holding"
  | "legacy_growth";
export type AgentPractice = "rental" | "sales" | "both";

export const AGENT_PLANS: AgentPlan[] = [
  "solo",
  "solo_pro",
  "team_member",
  "team_leader",
  "holding",
  "legacy_growth",
];
export const AGENT_PRACTICES: AgentPractice[] = ["rental", "sales", "both"];

/** Commission the agent keeps under each plan — the default when switching. */
export const PLAN_SPLIT_PCT: Record<AgentPlan, number> = {
  solo: 85,
  solo_pro: 100,
  team_member: 90,
  team_leader: 100,
  holding: 100,
  legacy_growth: 92,
};

export function isAgentPlan(v: unknown): v is AgentPlan {
  return typeof v === "string" && (AGENT_PLANS as string[]).includes(v);
}

export function isAgentPractice(v: unknown): v is AgentPractice {
  return typeof v === "string" && (AGENT_PRACTICES as string[]).includes(v);
}

/** Maps the three legacy values during the additive v3.1 rollout. */
export function normalizeAgentPlan(v: unknown): AgentPlan {
  if (isAgentPlan(v)) return v;
  if (v === "elite") return "solo_pro";
  if (v === "growth") return "legacy_growth";
  return "solo";
}

export const PLAN_LABELS: Record<"en" | "zh", Record<AgentPlan, string>> = {
  en: {
    solo: "Solo",
    solo_pro: "Solo Pro",
    team_member: "Team Member",
    team_leader: "Team Leader",
    holding: "Holding / Non-Producing",
    legacy_growth: "Legacy Growth",
  },
  zh: {
    solo: "独立经纪人",
    solo_pro: "独立经纪人 Pro",
    team_member: "团队成员",
    team_leader: "团队负责人",
    holding: "执照挂靠 / 暂不展业",
    legacy_growth: "原 Growth 方案",
  },
};

export const PRACTICE_LABELS: Record<
  "en" | "zh",
  Record<AgentPractice, string> & { unset: string }
> = {
  en: { rental: "Rental", sales: "Sales", both: "Rental + Sales", unset: "Not set" },
  zh: { rental: "租赁", sales: "买卖", both: "租赁 + 买卖", unset: "未设置" },
};
