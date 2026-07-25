/**
 * Canonical training taxonomy. The order controls both the admin picker and
 * the library. Keep renamed labels in LEGACY_TRAINING_CATEGORY_MAP until all
 * environments have applied the matching data migration.
 */
export const TRAINING_CATEGORY_DEFINITIONS = [
  {
    name: "租赁实务",
    description: {
      zh: "从租客筛选、申请材料和楼盘规则，到佣金、续租与发票流程。",
      en: "Tenant screening, applications, building rules, commissions, renewals, and invoicing.",
    },
  },
  {
    name: "买家课程",
    description: {
      zh: "需求分析、贷款预批、看房、报价、合同、验房与过户。",
      en: "Buyer discovery, pre-approval, showings, offers, contracts, inspections, and closing.",
    },
  },
  {
    name: "卖家课程",
    description: {
      zh: "定价、房源准备、营销、议价、合同和成交管理。",
      en: "Pricing, listing preparation, marketing, negotiation, contracts, and closing management.",
    },
  },
  {
    name: "内容营销与个人品牌",
    description: {
      zh: "内容定位、拍摄剪辑、平台运营与经纪人个人品牌建设。",
      en: "Content strategy, production, platform operations, and agent brand building.",
    },
  },
  {
    name: "地产实务与工具",
    description: {
      zh: "贷款、保险、律师、税务、AI 与业务软件等工作知识。",
      en: "Mortgage, insurance, legal, tax, AI, and business-software knowledge.",
    },
  },
  {
    name: "行业趋势与活动",
    description: {
      zh: "市场趋势、行业会议、嘉宾分享与活动回放。",
      en: "Market trends, industry conferences, guest sessions, and event replays.",
    },
  },
] as const;

export type TrainingCategory =
  (typeof TRAINING_CATEGORY_DEFINITIONS)[number]["name"];

export const TRAINING_CATEGORIES: TrainingCategory[] =
  TRAINING_CATEGORY_DEFINITIONS.map((category) => category.name);

const LEGACY_TRAINING_CATEGORY_MAP: Record<string, TrainingCategory> = {
  自媒体培训: "内容营销与个人品牌",
  "IP 培训 / 个人品牌": "内容营销与个人品牌",
  "IP培训/个人品牌": "内容营销与个人品牌",
  "Inman 2026": "行业趋势与活动",
};

export function isTrainingCategory(value: unknown): value is TrainingCategory {
  return (
    typeof value === "string" &&
    (TRAINING_CATEGORIES as readonly string[]).includes(value)
  );
}

export function normalizeTrainingCategory(
  value: unknown,
): TrainingCategory | null {
  if (typeof value !== "string") return null;
  const category = value.trim();
  if (isTrainingCategory(category)) return category;
  return LEGACY_TRAINING_CATEGORY_MAP[category] ?? null;
}

export function trainingCategoryDescription(
  category: string,
  locale: "en" | "zh",
): string | null {
  const normalized = normalizeTrainingCategory(category);
  if (!normalized) return null;
  return (
    TRAINING_CATEGORY_DEFINITIONS.find((item) => item.name === normalized)
      ?.description[locale] ?? null
  );
}
