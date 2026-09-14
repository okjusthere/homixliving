import type { Agent, OnboardingFeeAdjustment } from "@/db/schema";
import { getCommerceProduct, ONBOARDING_LICENSE_TRANSFER_FEE_CENTS } from "@/lib/commerce/catalog";
import { onboardingPaymentProduct } from "@/lib/onboarding";

type FeeSubject = Pick<Agent, "plan"> & Partial<Pick<Agent,
  "affiliationTermMonths" | "licensedCompanyId" | "onboardingFeeAdjustment"
>>;

/** A waiver changes receivables, never creates a receipt or sponsor income. */
export function onboardingFeeQuote(agent: FeeSubject) {
  const termMonths = agent.affiliationTermMonths === 24 ? 24 : 12;
  const productKey = onboardingPaymentProduct(agent.plan, termMonths)!;
  const product = getCommerceProduct(productKey)!;
  // This is the onboarding-cycle quote, including after account activation.
  const originalAmountCents = product.amountCents + ONBOARDING_LICENSE_TRANSFER_FEE_CENTS;
  const saved = agent.onboardingFeeAdjustment;
  const adjustment = saved && saved.productKey === productKey &&
    saved.plan === agent.plan && saved.termMonths === termMonths &&
    saved.companyId === (agent.licensedCompanyId ?? null) &&
    saved.originalAmountCents === originalAmountCents &&
    Number.isSafeInteger(saved.waivedAmountCents) && saved.waivedAmountCents > 0 &&
    saved.waivedAmountCents <= originalAmountCents &&
    saved.reason?.trim().length >= 5 && saved.approvedBy > 0 &&
    Number.isFinite(Date.parse(saved.approvedAt)) ? saved : null;
  const waivedAmountCents = adjustment?.waivedAmountCents ?? 0;
  return { productKey, termMonths, originalAmountCents, waivedAmountCents,
    dueAmountCents: originalAmountCents - waivedAmountCents, adjustment };
}

export function fullyWaivedOnboarding(agent: FeeSubject & Pick<Agent, "paymentStatus">) {
  const quote = onboardingFeeQuote(agent);
  return agent.paymentStatus === "not_required" && Boolean(quote.adjustment) && quote.dueAmountCents === 0;
}

export function createOnboardingFeeAdjustment(
  agent: FeeSubject, waivedAmountCents: number, reason: string, actorId: number,
  approvedAt = new Date().toISOString(),
): OnboardingFeeAdjustment {
  const quote = onboardingFeeQuote(agent);
  if (!Number.isSafeInteger(waivedAmountCents) || waivedAmountCents <= 0 ||
      waivedAmountCents > quote.originalAmountCents || reason.trim().length < 5 || actorId <= 0)
    throw new Error("Enter a valid fee reduction and the reason for approval");
  return { productKey: quote.productKey, plan: agent.plan, termMonths: quote.termMonths,
    companyId: agent.licensedCompanyId ?? null, originalAmountCents: quote.originalAmountCents,
    waivedAmountCents, reason: reason.trim(), approvedBy: actorId, approvedAt };
}
