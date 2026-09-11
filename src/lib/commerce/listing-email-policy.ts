import type Stripe from "stripe";
import { STRIPE_APP_ID } from "./stripe-app";

export const LISTING_EMAIL_AMOUNT_CENTS = 2200;
export const LISTING_EMAIL_PRODUCT_KEY = "listing_email_blast";
export type ListingEmailPayment = { paid: boolean; status: "unpaid" | "pending" | "paid" | "expired" | "refunded" };

/** Check Stripe's current state, including the charge, rather than browser flags
 * or the timing/order of webhook deliveries. A payment belongs to one campaign. */
export function listingEmailPaymentState(
  session: Stripe.Checkout.Session,
  binding: { campaignId: string; agentId: number; orderId: number },
): ListingEmailPayment {
  const m = session.metadata;
  if (m?.app !== STRIPE_APP_ID || m.productKey !== LISTING_EMAIL_PRODUCT_KEY ||
      m.campaignId !== binding.campaignId || m.agentId !== String(binding.agentId) ||
      m.orderId !== String(binding.orderId) || session.client_reference_id !== String(binding.orderId)) {
    throw new Error("Checkout does not match this campaign");
  }
  const intent = session.payment_intent;
  const charge = intent && typeof intent !== "string" ? intent.latest_charge : null;
  if (charge && typeof charge !== "string" && (charge.refunded || charge.amount_refunded > 0 || charge.disputed)) {
    return { paid: false, status: "refunded" };
  }
  const paid = session.mode === "payment" && session.status === "complete" &&
    session.payment_status === "paid" && session.currency === "usd" &&
    session.amount_subtotal === LISTING_EMAIL_AMOUNT_CENTS &&
    session.amount_total === LISTING_EMAIL_AMOUNT_CENTS &&
    !!intent && typeof intent !== "string" && intent.status === "succeeded" &&
    intent.currency === "usd" && intent.amount_received === LISTING_EMAIL_AMOUNT_CENTS &&
    !!charge && typeof charge !== "string" && charge.paid && charge.captured;
  return { paid, status: paid ? "paid" : session.status === "expired" ? "expired" : "pending" };
}
