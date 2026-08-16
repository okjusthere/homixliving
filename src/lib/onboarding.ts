import type { AgentPlan } from "@/lib/agent-plans";
import type { CommerceProductKey } from "@/lib/commerce/catalog";

export const SOLO_PRO_UPGRADE_CREDIT_DAYS = 90;

export function soloProUpgradeCreditCents(input: {
  currentPlan: AgentPlan;
  priorProductKey: string;
  priorAmountCents: number;
  priorPaidAt: string | null;
  now?: Date;
}) {
  if (!['solo', 'holding', 'legacy_growth'].includes(input.currentPlan)) return 0;
  if (!['one_year_membership', 'two_year_membership'].includes(input.priorProductKey)) return 0;
  if (!input.priorPaidAt) return 0;
  const paidAt = new Date(input.priorPaidAt);
  const now = input.now || new Date();
  if (!Number.isFinite(paidAt.getTime())) return 0;
  const ageMs = now.getTime() - paidAt.getTime();
  if (ageMs < 0 || ageMs > SOLO_PRO_UPGRADE_CREDIT_DAYS * 86_400_000) return 0;
  return Math.min(50_000, Math.max(0, Math.round(input.priorAmountCents)));
}

export function onboardingPaymentProduct(
  plan: AgentPlan,
  affiliationTermMonths: number | null,
): CommerceProductKey | null {
  if (plan === "solo_pro" || plan === "team_leader") return "elite_desk_fee";
  return affiliationTermMonths === 24 ? "two_year_membership" : "one_year_membership";
}

export function isOnboardingV2Enforced() {
  return process.env.ONBOARDING_V2_ENFORCED === "1";
}
