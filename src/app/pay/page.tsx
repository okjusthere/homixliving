import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { agents } from "@/db/schema";
import {
  formatProductAmount,
  getCommerceProduct,
  getConfiguredCommerceProducts,
} from "@/lib/commerce/catalog";
import { getWorkspaceAllowedDomains } from "@/lib/google-workspace";
import { getStripeSecretKey } from "@/lib/stripe";
import { PayClient, type PublicPayProduct } from "./pay-client";
import { canPurchasePlanProduct } from "@/lib/plan-payments";
import {
  onboardingAgreementAllowsPayment,
  onboardingPaymentProduct,
} from "@/lib/onboarding";
import { syncOnboardingAgreement } from "@/lib/onboarding-agreement";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Homix Payments",
  description: "Online payments for Homix agent affiliation plans, company email, and services.",
};

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string | string[]; product?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.agentId) redirect("/login?callbackUrl=/pay");
  let [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, session.user.agentId))
    .limit(1);
  if (!agent || agent.accountStatus === "inactive") redirect("/pending");
  if (
    agent.accountStatus === "pending" &&
    agent.signingRequestId &&
    !onboardingAgreementAllowsPayment(agent)
  ) {
    try {
      agent = await syncOnboardingAgreement(agent);
    } catch (error) {
      console.error("Unable to verify agent signature before payment", error);
    }
  }
  const params = await searchParams;
  const canceled = params.canceled === "1";
  const onboarding = agent.accountStatus === "pending";
  const onboardingProductKey = onboarding
    ? onboardingPaymentProduct(agent.plan, agent.affiliationTermMonths)
    : null;
  if (onboarding && (!onboardingAgreementAllowsPayment(agent) || !onboardingProductKey)) {
    redirect("/pending");
  }
  if (onboarding && agent.paymentStatus === "paid") redirect("/pending");
  const licenseTransferProduct = onboarding
    ? getCommerceProduct("license_transfer_fee")
    : null;
  const products: PublicPayProduct[] = getConfiguredCommerceProducts()
    .filter((product) => !onboarding || product.key === onboardingProductKey)
    .filter((product) => canPurchasePlanProduct(agent, product.key).ok)
    .map((product) => ({
    key: product.key,
    name: product.name,
    description: product.description,
    amountCents: product.amountCents,
    currency: product.currency,
    billingMode: product.billingMode,
    priceEnvVar: product.priceEnvVar,
    category: product.category,
    recurrenceLabel: product.recurrenceLabel,
    commissionLabel: product.commissionLabel,
    requiresWorkspaceEmail: product.requiresWorkspaceEmail,
    requiresReferral: product.requiresReferral,
    configured: product.configured,
    priceLabel: formatProductAmount(product.amountCents),
    }));

  return (
    <PayClient
      products={products}
      canceled={canceled}
      stripeConfigured={Boolean(getStripeSecretKey())}
      workspaceDomains={getWorkspaceAllowedDomains()}
      initialProductKey={onboardingProductKey || (typeof params.product === "string" ? params.product : undefined)}
      onboarding={onboarding}
      licenseTransferFee={licenseTransferProduct ? {
        name: licenseTransferProduct.name,
        amountCents: licenseTransferProduct.amountCents,
        priceLabel: formatProductAmount(licenseTransferProduct.amountCents),
      } : null}
      identity={{
        name: agent.legalName || agent.name,
        email: agent.email,
        phone: agent.phone || "",
        referralHasAgent: agent.referredByAgentId ? "yes" : "no",
        referralAgentName: "",
      }}
    />
  );
}
