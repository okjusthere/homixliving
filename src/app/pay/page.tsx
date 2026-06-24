import type { Metadata } from "next";
import { getConfiguredCommerceProducts, formatProductAmount } from "@/lib/commerce/catalog";
import { getWorkspaceAllowedDomains } from "@/lib/google-workspace";
import { getStripeSecretKey } from "@/lib/stripe";
import { PayClient, type PublicPayProduct } from "./pay-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Homix Payments",
  description: "Online payments for Homix agent memberships, desk fees, and company email.",
};

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string | string[] }>;
}) {
  const params = await searchParams;
  const canceled = params.canceled === "1";
  const products: PublicPayProduct[] = getConfiguredCommerceProducts().map((product) => ({
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
    />
  );
}
