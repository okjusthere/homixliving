/**
 * Required-documents checklist groups (做单必交文件), in deal-lifecycle order.
 * Items live in the checklist_items table (group_key references these keys);
 * the group set itself changes rarely, so it stays in code where ordering and
 * bilingual labels are easy to keep honest.
 */
export const CHECKLIST_GROUPS = [
  {
    key: "new-listing-residential",
    en: "New Listing (Residential)",
    zh: "新挂牌 · 住宅 New Listing (Residential)",
  },
  {
    key: "pending",
    en: "Pending (Under Contract)",
    zh: "已签约 Pending (Under Contract)",
  },
  {
    key: "closing",
    en: "Closing",
    zh: "过户 Closing",
  },
  {
    key: "new-listing-rental",
    en: "New Listing (Rental)",
    zh: "新挂牌 · 租赁 New Listing (Rental)",
  },
  {
    key: "rented",
    en: "Rented (Leased)",
    zh: "已租出 Rented (Leased)",
  },
] as const;

export type ChecklistGroupKey = (typeof CHECKLIST_GROUPS)[number]["key"];

export function isChecklistGroupKey(v: string): v is ChecklistGroupKey {
  return CHECKLIST_GROUPS.some((g) => g.key === v);
}

/**
 * Which checklist groups a recorded deal must file. Recorded rentals are
 * closed leases → the "rented" packet. Sales depend on which side we
 * represented: seller side files the listing packet, buyer side files the
 * buyer-signed packet ("pending"), dual agency files both, referrals only the
 * closing money docs. Every closed sale files "closing" (commission check +
 * commission report).
 */
export function checklistGroupsForDeal(
  dealType: "rental" | "sale",
  representationType?: string | null,
): ChecklistGroupKey[] {
  if (dealType === "rental") return ["rented"];
  switch (representationType) {
    case "seller_rep":
      return ["new-listing-residential", "closing"];
    case "dual_agency":
      return ["new-listing-residential", "pending", "closing"];
    case "referral":
      return ["closing"];
    case "buyer_rep":
    default:
      return ["pending", "closing"];
  }
}
