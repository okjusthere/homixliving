import type { AgentPlan } from "@/lib/agent-plans";

export const ONBOARDING_ENTRY_COOKIE = "homix_onboarding_entry";
export const ONBOARDING_ENTRY_MAX_AGE_SECONDS = 30 * 60;

export type OnboardingEntrySource = "direct" | "website";
export type OnboardingEntryLocale = "en" | "zh";
export type PublicOnboardingPlan = Extract<AgentPlan, "solo" | "solo_pro" | "team_member">;

export type OnboardingEntryContext = {
  source: OnboardingEntrySource;
  locale: OnboardingEntryLocale;
  plan: PublicOnboardingPlan | null;
  campaign: string | null;
};

const PUBLIC_PLANS = new Set<PublicOnboardingPlan>([
  "solo",
  "solo_pro",
  "team_member",
]);

function cleanCampaign(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.trim();
  return /^[a-z0-9_-]{1,64}$/i.test(cleaned) ? cleaned : null;
}

export function onboardingEntryFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">,
): OnboardingEntryContext {
  const source = searchParams.get("source") === "homix-web" ? "website" : "direct";
  const locale = searchParams.get("lang") === "zh" ? "zh" : "en";
  const requestedPlan = searchParams.get("plan");
  const plan = PUBLIC_PLANS.has(requestedPlan as PublicOnboardingPlan)
    ? (requestedPlan as PublicOnboardingPlan)
    : null;

  return {
    source,
    locale,
    plan,
    campaign: cleanCampaign(
      searchParams.get("campaign") || searchParams.get("utm_campaign"),
    ),
  };
}

export function serializeOnboardingEntry(context: OnboardingEntryContext): string {
  return Buffer.from(JSON.stringify(context), "utf8").toString("base64url");
}

export function readOnboardingEntryContext(
  value: string | null | undefined,
): OnboardingEntryContext | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<OnboardingEntryContext>;
    if (parsed.source !== "direct" && parsed.source !== "website") return null;
    if (parsed.locale !== "en" && parsed.locale !== "zh") return null;
    if (parsed.plan !== null && !PUBLIC_PLANS.has(parsed.plan as PublicOnboardingPlan)) {
      return null;
    }
    if (parsed.campaign !== null && cleanCampaign(parsed.campaign || null) !== parsed.campaign) {
      return null;
    }

    return {
      source: parsed.source,
      locale: parsed.locale,
      plan: (parsed.plan as PublicOnboardingPlan | null) ?? null,
      campaign: parsed.campaign ?? null,
    };
  } catch {
    return null;
  }
}

export function onboardingEntryForSignIn(
  value: string | null | undefined,
  hasUsableInvitation: boolean,
): OnboardingEntryContext | null {
  return hasUsableInvitation ? null : readOnboardingEntryContext(value);
}
