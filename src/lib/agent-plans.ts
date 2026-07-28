/**
 * Commission plan and practice area — the two things an admin most often needs
 * to adjust on an existing agent.
 *
 * Plans mirror the desk-fee products in lib/commerce/catalog.ts, where the fee
 * and the commission split are two sides of the same deal:
 *   standard — no desk fee, agent keeps 80%
 *   growth   — $1,588/yr desk fee, agent keeps 92%
 *   elite    — $3,650/yr desk fee, agent keeps 100%
 *
 * The split stays its own column: the plan sets the expected default, but a
 * negotiated exception has to remain possible, so we suggest rather than force.
 */

export type AgentPlan = "standard" | "growth" | "elite";
export type AgentPractice = "rental" | "sales" | "both";

export const AGENT_PLANS: AgentPlan[] = ["standard", "growth", "elite"];
export const AGENT_PRACTICES: AgentPractice[] = ["rental", "sales", "both"];

/** Commission the agent keeps under each plan — the default when switching. */
export const PLAN_SPLIT_PCT: Record<AgentPlan, number> = {
  standard: 80,
  growth: 92,
  elite: 100,
};

export function isAgentPlan(v: unknown): v is AgentPlan {
  return typeof v === "string" && (AGENT_PLANS as string[]).includes(v);
}

export function isAgentPractice(v: unknown): v is AgentPractice {
  return typeof v === "string" && (AGENT_PRACTICES as string[]).includes(v);
}

/** Falls back to `standard` so a null/legacy value still renders sensibly. */
export function normalizeAgentPlan(v: unknown): AgentPlan {
  return isAgentPlan(v) ? v : "standard";
}

export const PLAN_LABELS: Record<"en" | "zh", Record<AgentPlan, string>> = {
  en: { standard: "Standard", growth: "Growth", elite: "Elite" },
  zh: { standard: "标准", growth: "Growth", elite: "Elite" },
};

export const PRACTICE_LABELS: Record<
  "en" | "zh",
  Record<AgentPractice, string> & { unset: string }
> = {
  en: { rental: "Rental", sales: "Sales", both: "Rental + Sales", unset: "Not set" },
  zh: { rental: "租赁", sales: "买卖", both: "租赁 + 买卖", unset: "未设置" },
};
