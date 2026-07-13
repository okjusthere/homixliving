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
