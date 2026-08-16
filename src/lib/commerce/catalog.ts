export type BillingMode = "payment" | "subscription";

export type CommerceProductKey =
  | "two_year_membership"
  | "one_year_membership"
  | "company_domain_email"
  | "elite_desk_fee"
  | "growth_desk_fee"
  | "libor"
  | "transfer_fee";

export type CommerceProduct = {
  key: CommerceProductKey;
  name: string;
  description: string;
  amountCents: number;
  currency: "usd";
  billingMode: BillingMode;
  priceEnvVar: string;
  category: "membership" | "workspace" | "desk_fee" | "service";
  recurrenceLabel?: string;
  commissionLabel?: string;
  requiresWorkspaceEmail?: boolean;
  requiresReferral?: boolean;
  availableForSale?: boolean;
};

export const commerceProducts: CommerceProduct[] = [
  {
    key: "company_domain_email",
    name: "Company domain Email",
    description: "Company-domain inbox for agent branding and Homix operations.",
    amountCents: 1030,
    currency: "usd",
    billingMode: "subscription",
    priceEnvVar: "STRIPE_PRICE_COMPANY_DOMAIN_EMAIL_MONTHLY",
    category: "workspace",
    recurrenceLabel: "Monthly",
    requiresWorkspaceEmail: true,
  },
  {
    key: "elite_desk_fee",
    name: "Solo Pro Annual Plan Fee",
    description: "Annual Solo Pro plan fee with 100% commission and per-transaction fees.",
    amountCents: 365000,
    currency: "usd",
    billingMode: "subscription",
    priceEnvVar: "STRIPE_PRICE_ELITE_DESK_FEE_YEARLY",
    category: "desk_fee",
    recurrenceLabel: "Annual renewal",
    commissionLabel: "100% commission · transaction fee applies",
    requiresReferral: true,
  },
  {
    key: "growth_desk_fee",
    name: "Growth Plan Desk Fee",
    description: "Annual desk fee for agents keeping 92% of commission.",
    amountCents: 158800,
    currency: "usd",
    billingMode: "subscription",
    priceEnvVar: "STRIPE_PRICE_GROWTH_DESK_FEE_YEARLY",
    category: "desk_fee",
    recurrenceLabel: "Annual renewal",
    commissionLabel: "Keep 92%",
    requiresReferral: true,
    availableForSale: false,
  },
  {
    key: "two_year_membership",
    name: "Two-Year Homix Affiliation Fee",
    description: "Two-year affiliation term for Solo and Team Member plans.",
    amountCents: 50000,
    currency: "usd",
    billingMode: "payment",
    priceEnvVar: "STRIPE_PRICE_TWO_YEAR_MEMBERSHIP",
    category: "membership",
    requiresReferral: true,
  },
  {
    key: "one_year_membership",
    name: "One-Year Homix Affiliation Fee",
    description: "One-year affiliation term for Solo and Team Member plans.",
    amountCents: 28800,
    currency: "usd",
    billingMode: "payment",
    priceEnvVar: "STRIPE_PRICE_ONE_YEAR_MEMBERSHIP",
    category: "membership",
    requiresReferral: true,
  },
  {
    key: "libor",
    name: "LIBOR",
    description: "Company-handled LIBOR account service.",
    amountCents: 61800,
    currency: "usd",
    billingMode: "payment",
    priceEnvVar: "STRIPE_PRICE_LIBOR",
    category: "service",
  },
  {
    key: "transfer_fee",
    name: "Transfer Fee",
    description: "Agent transfer fee.",
    amountCents: 2200,
    currency: "usd",
    billingMode: "payment",
    priceEnvVar: "STRIPE_PRICE_TRANSFER_FEE",
    category: "service",
  },
];

export type CommerceProductWithPrice = CommerceProduct & {
  stripePriceId: string | null;
  configured: boolean;
};

export function getCommerceProduct(key: string): CommerceProduct | null {
  return commerceProducts.find((product) => product.key === key) ?? null;
}

export function getProductStripePriceId(product: CommerceProduct): string | null {
  return process.env[product.priceEnvVar]?.trim() || null;
}

export function getConfiguredCommerceProducts(): CommerceProductWithPrice[] {
  return commerceProducts.filter((product) => product.availableForSale !== false).map((product) => {
    const stripePriceId = getProductStripePriceId(product);
    return {
      ...product,
      stripePriceId,
      configured: Boolean(stripePriceId),
    };
  });
}

export function formatProductAmount(amountCents: number): string {
  return (amountCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  });
}

const ZH_PRODUCT_NAMES: Partial<Record<CommerceProductKey, string>> = {
  company_domain_email: "公司域名邮箱",
  elite_desk_fee: "Solo Pro 年费",
  growth_desk_fee: "Legacy Growth 年费（已停止新售）",
  two_year_membership: "Homix 两年 affiliation 费用",
  one_year_membership: "Homix 一年 affiliation 费用",
  libor: "LIBOR",
  transfer_fee: "经纪人转入费",
};

export function commerceProductName(
  key: string,
  fallback: string,
  locale: "en" | "zh" = "en",
) {
  return locale === "zh" ? ZH_PRODUCT_NAMES[key as CommerceProductKey] || fallback : fallback;
}
