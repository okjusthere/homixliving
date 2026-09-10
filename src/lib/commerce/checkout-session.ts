import type Stripe from "stripe";
import type { BillingMode } from "./catalog";
import { checkoutCustomerOptions } from "./stripe-customer";
import { withStripeAppMetadata } from "./stripe-app";

export function buildCheckoutSessionParams({
  billingMode,
  lineItems,
  stripeCustomerId,
  orderId,
  metadata,
  description,
  couponId,
  hasLicenseTransferFee,
  automaticTaxEnabled,
  baseUrl,
}: {
  billingMode: BillingMode;
  lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
  stripeCustomerId: string;
  orderId: number;
  metadata: Record<string, string>;
  description: string;
  couponId?: string | null;
  hasLicenseTransferFee: boolean;
  automaticTaxEnabled: boolean;
  baseUrl: string;
}): Stripe.Checkout.SessionCreateParams {
  const scopedMetadata = withStripeAppMetadata(metadata);
  return {
    mode: billingMode,
    line_items: lineItems,
    ...checkoutCustomerOptions(stripeCustomerId),
    client_reference_id: String(orderId),
    metadata: scopedMetadata,
    subscription_data:
      billingMode === "subscription"
        ? { metadata: scopedMetadata, description }
        : undefined,
    payment_intent_data:
      billingMode === "payment"
        ? { metadata: scopedMetadata, description }
        : undefined,
    discounts: couponId ? [{ coupon: couponId }] : undefined,
    allow_promotion_codes: couponId || hasLicenseTransferFee ? undefined : true,
    billing_address_collection: "auto",
    automatic_tax: { enabled: automaticTaxEnabled },
    success_url: `${baseUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/pay?canceled=1`,
  };
}
