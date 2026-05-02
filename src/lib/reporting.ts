import { computeCommission, type CommissionAgentInput } from "@/lib/commission";

export type DealForReporting = {
  id: number;
  totalCommission: number;
  referrerType?: string | null;
  referrerAmount?: number | null;
  dealDate?: string | null;
  createdAt?: string | null;
  status: string;
};

export type DealAgentForReporting = {
  dealId: number;
  agentId: number;
  sharePct: number;
  isPrimary?: boolean | null;
};

export type AgentForReporting = {
  id: number;
  name?: string | null;
  splitPct?: number | null;
};

export function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getDealDate(deal: Pick<DealForReporting, "dealDate" | "createdAt">) {
  return deal.dealDate || deal.createdAt || "";
}

export function dealInMonth(deal: Pick<DealForReporting, "dealDate" | "createdAt">, month: string) {
  return getDealDate(deal).startsWith(month);
}

export function dealInYear(deal: Pick<DealForReporting, "dealDate" | "createdAt">, year: string) {
  return getDealDate(deal).startsWith(year);
}

export function activeDeal(deal: Pick<DealForReporting, "status">) {
  return deal.status !== "cancelled";
}

export function commissionAgentsForDeal({
  dealId,
  dealAgents,
  agents,
}: {
  dealId: number;
  dealAgents: DealAgentForReporting[];
  agents: AgentForReporting[];
}): CommissionAgentInput[] {
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  return dealAgents
    .filter((row) => row.dealId === dealId)
    .map((row) => {
      const agent = agentById.get(row.agentId);
      return {
        agentId: row.agentId,
        name: agent?.name || null,
        sharePct: Number(row.sharePct || 0),
        splitPct: Number(agent?.splitPct || 0),
        isPrimary: Boolean(row.isPrimary),
      };
    });
}

export function getAgentTakeForDeal({
  deal,
  agentId,
  participants,
}: {
  deal: DealForReporting;
  agentId: number;
  participants: CommissionAgentInput[];
}) {
  const breakdown = computeCommission({
    totalCommission: Number(deal.totalCommission || 0),
    referrer:
      deal.referrerType === "percent" || deal.referrerType === "flat"
        ? { type: deal.referrerType, amount: Number(deal.referrerAmount || 0) }
        : null,
    agents: participants,
  });

  return breakdown.agents.find((row) => row.agentId === agentId)?.agentTake || 0;
}
