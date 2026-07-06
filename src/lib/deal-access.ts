// Shared helpers for routes that address "a deal" polymorphically
// (rental or sale) — used by the documents feature.
import {
  canEditDeal,
  canEditSaleDeal,
  canViewDeal,
  canViewSaleDeal,
} from "@/lib/visibility";

export type DealType = "rental" | "sale";

export function parseDealType(raw: string): DealType | null {
  return raw === "rental" || raw === "sale" ? raw : null;
}

type AccessSession = {
  user: { agentId: number | null; isAdmin: boolean; isActive: boolean };
};

export async function canViewDealOfType(
  session: AccessSession,
  dealType: DealType,
  dealId: number
): Promise<boolean> {
  return dealType === "rental"
    ? canViewDeal(session, dealId)
    : canViewSaleDeal(session, dealId);
}

export async function canEditDealOfType(
  session: AccessSession,
  dealType: DealType,
  dealId: number
): Promise<boolean> {
  return dealType === "rental"
    ? canEditDeal(session, dealId)
    : canEditSaleDeal(session, dealId);
}
