import assert from "node:assert/strict";
import type Stripe from "stripe";
import { listingEmailPaymentState } from "../commerce/listing-email-policy";
import { getConfiguredCommerceProducts, commerceProductName } from "../commerce/catalog";
const binding = { campaignId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", agentId: 42, orderId: 7 };
const settled = {
  mode: "payment", status: "complete", payment_status: "paid", currency: "usd", amount_total: 2200, amount_subtotal: 2200,
  client_reference_id: "7", metadata: { app: "homixliving", productKey: "listing_email_blast", campaignId: binding.campaignId, agentId: "42", orderId: "7" },
  payment_intent: { status: "succeeded", currency: "usd", amount_received: 2200, latest_charge: { paid: true, captured: true, amount_refunded: 0, refunded: false, disputed: false } },
} as unknown as Stripe.Checkout.Session;
assert.deepEqual(listingEmailPaymentState(settled, binding), { paid: true, status: "paid" });
for (const patch of [
  { payment_status: "unpaid" }, { payment_status: "no_payment_required" }, { status: "open" },
  { status: "expired" }, { amount_total: 0 }, { amount_total: 2100 }, { amount_subtotal: 2100 },
  { currency: "eur" }, { mode: "subscription" }, { payment_intent: null }, { payment_intent: "pi_unexpanded" },
]) assert.equal(listingEmailPaymentState({ ...settled, ...patch } as Stripe.Checkout.Session, binding).paid, false, JSON.stringify(patch));
for (const patch of [{ campaignId: "other" }, { agentId: 43 }, { orderId: 8 }])
  assert.throws(() => listingEmailPaymentState(settled, { ...binding, ...patch }));
for (const patch of [{ app: "another-app" }, { productKey: "transfer_fee" }, { orderId: "8" }] as Stripe.Metadata[])
  assert.throws(() => listingEmailPaymentState({ ...settled, metadata: { ...settled.metadata, ...patch } as Stripe.Metadata }, binding));
const intent = settled.payment_intent as Stripe.PaymentIntent;
for (const patch of [{ amount_refunded: 1 }, { refunded: true }, { disputed: true }]) {
  const session = { ...settled, payment_intent: { ...intent, latest_charge: { ...(intent.latest_charge as Stripe.Charge), ...patch } } };
  assert.deepEqual(listingEmailPaymentState(session, binding), { paid: false, status: "refunded" });
}
const products = getConfiguredCommerceProducts();
assert.equal(products.some((p) => p.key === "transfer_fee"), false);
assert.equal(products.find((p) => p.key === "listing_email_blast")?.amountCents, 2200);
assert.equal(commerceProductName("listing_email_blast", "Listing Email Blast", "zh"), "Listing 邮件群发");
console.log("Listing email payment policy: paid, unpaid, wrong task/owner/product/app, amount, refund and catalog checks passed");
