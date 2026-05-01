import { computeCommission } from "@/lib/commission";

export type DealForReporting = {
  id: number;
  totalCommission: number;
  primaryAgentId: number;
  primaryAgentSharePct: number;
  coAgentId?: number | null;
  coAgentSharePct?: number | null;
  referrerType?: string | null;
  referrerAmount?: number | null;
  dealDate?: string | null;
  createdAt?: string | null;
  status: string;
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

export function getAgentTakeForDeal({
  deal,
  agentId,
  primaryAgentSplitPct,
  coAgentSplitPct,
}: {
  deal: DealForReporting;
  agentId: number;
  primaryAgentSplitPct: number;
  coAgentSplitPct?: number;
}) {
  const breakdown = computeCommission({
    totalCommission: Number(deal.totalCommission || 0),
    referrer:
      deal.referrerType === "percent" || deal.referrerType === "flat"
        ? { type: deal.referrerType, amount: Number(deal.referrerAmount || 0) }
        : null,
    primaryAgentSharePct: Number(deal.primaryAgentSharePct || 100),
    primaryAgentSplitPct,
    coAgent: deal.coAgentId
      ? {
          sharePct: Number(deal.coAgentSharePct || 0),
          splitPct: Number(coAgentSplitPct || 0),
        }
      : null,
  });

  if (agentId === deal.primaryAgentId) return breakdown.primaryAgentTake;
  if (agentId === deal.coAgentId) return breakdown.coAgentTake;
  return 0;
}
