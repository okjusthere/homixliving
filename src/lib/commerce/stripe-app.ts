import type Stripe from "stripe";

/**
 * Stable namespace used to isolate Homix objects and webhook traffic when the
 * Stripe account is shared with another application.
 */
export const STRIPE_APP_ID = "homixliving";

export type StripeMetadataScope = "owned" | "legacy" | "foreign";

export function withStripeAppMetadata(
  metadata: Record<string, string>,
): Record<string, string> {
  return { ...metadata, app: STRIPE_APP_ID };
}

export function stripeMetadataScope(
  metadata: Stripe.Metadata | Record<string, string> | null | undefined,
): StripeMetadataScope {
  const app = metadata?.app?.trim();
  if (!app) return "legacy";
  return app === STRIPE_APP_ID ? "owned" : "foreign";
}

export function shouldHandleStripeScope(
  scope: StripeMetadataScope,
  hasLegacyLocalMatch: boolean,
): boolean {
  if (scope === "owned") return true;
  if (scope === "foreign") return false;
  return hasLegacyLocalMatch;
}

export function invoiceSubscriptionMetadata(
  invoice: Stripe.Invoice,
): Stripe.Metadata | null {
  return invoice.parent?.subscription_details?.metadata ?? null;
}
