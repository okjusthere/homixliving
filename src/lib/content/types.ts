export const LISTING_THEMES = [
  { id: "coming_soon", group: "PRE-LIST", en: "Coming Soon", zh: "即将上市" },
  { id: "just_listed", group: "ACTIVE", en: "Just Listed", zh: "新房上市" },
  { id: "open_house", group: "ACTIVE", en: "Open House", zh: "公展" },
  {
    id: "under_contract",
    group: "PROCESS",
    en: "Under Contract",
    zh: "已签合约",
  },
  {
    id: "offer_accepted",
    group: "PROCESS",
    en: "Offer Accepted",
    zh: "报价已接受",
  },
  { id: "just_sold", group: "SOLD", en: "Just Sold", zh: "成功售出" },
] as const;

export type ListingTheme = (typeof LISTING_THEMES)[number]["id"];
export type ContentLanguage = "en" | "zh" | "bilingual";
export const IMAGE_SIZES = ["1024x1024", "1024x1280", "1152x2048"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];
export type BrandContext = {
  agentId: number;
  name: string;
  email: string;
  phone: string;
  title: string;
  licenseNumber: string;
  companyId: string;
  companyName: string;
  photoUrl: string | null;
};
export type ListingContext = {
  source: "mls" | "manual";
  sourceKey?: string;
  address: string;
  price: string;
  beds?: string;
  baths?: string;
  area?: string;
  annualPropertyTax?: string;
  monthlyMaintenanceFee?: string;
  associationFee?: string;
  associationFeeFrequency?: string;
  highlights?: PosterHighlight[];
  financialFacts?: (PosterHighlight & {
    kind: "property_tax" | "maintenance" | "hoa" | "other";
  })[];
  highlightsReviewed?: boolean;
  highlightsModel?: string;
  description?: string;
  imageAssetIds: string[];
  fetchedAt?: string;
  sourceStatus?: string;
};
export type PosterHighlight = {
  en: string;
  zh: string;
  evidence: string;
  selected?: boolean;
};
export type OpenHouseEvent = {
  date: string;
  start: string;
  end: string;
  timezone: string;
  selected?: boolean;
};
export type ContentInput = {
  kind: "listing" | "holiday";
  theme: string;
  language: ContentLanguage;
  size: ImageSize;
  includePortrait: boolean;
  headline: string;
  message: string;
  additionalInstructions: string;
  listing?: ListingContext;
  /** Legacy single-event input; normalized to events on submission. */
  event?: OpenHouseEvent;
  events?: OpenHouseEvent[];
  holidayDate?: string;
};
export type TemplateConfig = {
  name: { en: string; zh: string };
  description: { en: string; zh: string };
  kind: "listing" | "holiday";
  themes: string[];
  style: string;
  prompt: string;
  colors: [string, string, string];
  referenceAssetIds: string[];
  sizes: ImageSize[];
};
export type ContentTemplate = {
  id: string;
  familyId: string;
  version: number;
  status: "draft" | "published" | "retired";
  config: TemplateConfig;
  createdAt: string;
};
export type Holiday = {
  id: string;
  country: "US" | "CN";
  name: { en: string; zh: string };
  greeting: { en: string; zh: string };
  enabled: boolean;
  dates: { year: number; date: string }[];
};
export type GenerationStatus =
  | "queued"
  | "preparing"
  | "generating"
  | "saving"
  | "succeeded"
  | "failed"
  | "needs_review";
export type Generation = {
  id: string;
  projectId: string;
  ownerAgentId: number;
  templateId: string;
  status: GenerationStatus;
  input: ContentInput;
  brand: BrandContext;
  prompt: string;
  outputAssetId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  usage: Record<string, unknown> | null;
};
