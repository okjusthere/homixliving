export const SALE_REPRESENTATION_OPTIONS = [
  { value: "buyer_rep", labels: { en: "Buyer rep", zh: "买方代理" } },
  { value: "seller_rep", labels: { en: "Seller rep", zh: "卖方代理" } },
  { value: "dual_agency", labels: { en: "Dual agency", zh: "双重代理" } },
  { value: "referral", labels: { en: "Referral", zh: "转介" } },
] as const;

export const SALE_STAGE_OPTIONS = [
  { value: "pre_contract", labels: { en: "Pre-contract", zh: "合同前" } },
  { value: "under_contract", labels: { en: "Under contract", zh: "已签合同" } },
  { value: "post_contract", labels: { en: "Post-contract", zh: "过户准备" } },
  { value: "closed", labels: { en: "Closed", zh: "已过户" } },
] as const;

export type SaleRepresentation = (typeof SALE_REPRESENTATION_OPTIONS)[number]["value"];
export type SaleStage = (typeof SALE_STAGE_OPTIONS)[number]["value"];

type LabelLocale = "en" | "zh";

export function saleRepresentationLabel(value: string | null | undefined, locale: LabelLocale = "en") {
  return SALE_REPRESENTATION_OPTIONS.find((option) => option.value === value)?.labels[locale] ||
    SALE_REPRESENTATION_OPTIONS[0].labels[locale];
}

export function saleStageLabel(value: string | null | undefined, locale: LabelLocale = "en") {
  return SALE_STAGE_OPTIONS.find((option) => option.value === value)?.labels[locale] ||
    SALE_STAGE_OPTIONS[0].labels[locale];
}
