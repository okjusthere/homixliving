import type { AgentAccountStatus } from "@/db/schema";

export const AGENT_ACCOUNT_STATUSES = ["pending", "active", "inactive"] as const;

export function isAgentAccountStatus(value: unknown): value is AgentAccountStatus {
  return (
    typeof value === "string" &&
    AGENT_ACCOUNT_STATUSES.includes(value as AgentAccountStatus)
  );
}

export function normalizeAgentAccountStatus(
  value: unknown,
  fallback: AgentAccountStatus = "pending",
): AgentAccountStatus {
  return isAgentAccountStatus(value) ? value : fallback;
}

export function hasPortalAccess(status: AgentAccountStatus): boolean {
  return status === "active";
}
