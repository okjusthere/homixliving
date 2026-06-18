export const SALE_REPRESENTATION_OPTIONS = [
  { value: "buyer_rep", label: "Buyer rep" },
  { value: "seller_rep", label: "Seller rep" },
  { value: "dual_agency", label: "Dual agency" },
  { value: "referral", label: "Referral" },
] as const;

export const SALE_STAGE_OPTIONS = [
  { value: "pre_contract", label: "Pre-contract" },
  { value: "under_contract", label: "Under contract" },
  { value: "post_contract", label: "Post-contract" },
  { value: "closed", label: "Closed" },
] as const;

export type SaleRepresentation = (typeof SALE_REPRESENTATION_OPTIONS)[number]["value"];
export type SaleStage = (typeof SALE_STAGE_OPTIONS)[number]["value"];

export function saleRepresentationLabel(value: string | null | undefined) {
  return SALE_REPRESENTATION_OPTIONS.find((option) => option.value === value)?.label || "Buyer rep";
}

export function saleStageLabel(value: string | null | undefined) {
  return SALE_STAGE_OPTIONS.find((option) => option.value === value)?.label || "Pre-contract";
}
