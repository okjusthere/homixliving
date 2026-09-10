import assert from "node:assert/strict";
import { validateCheckoutPayload } from "../commerce/checkout";
import { settledCheckoutAmountCents } from "../commerce/settlement";
import { buildCheckoutSessionParams } from "../commerce/checkout-session";
import { normalizeWorkspaceRecoveryPhone, resolveWorkspaceRetentionDays } from "../google-workspace";

process.env.GOOGLE_WORKSPACE_ALLOWED_DOMAINS = "homixny.com";

const base = {
  customerName: "Jane Agent",
  customerEmail: "jane.personal@example.com",
};

const validWorkspace = validateCheckoutPayload({
  ...base,
  productKey: "company_domain_email",
  requestedWorkspaceEmail: "jane@homixny.com",
});
assert.equal(validWorkspace.ok, true);

const wrongDomain = validateCheckoutPayload({
  ...base,
  productKey: "company_domain_email",
  requestedWorkspaceEmail: "jane@example.com",
});
assert.equal(wrongDomain.ok, false);

const missingReferral = validateCheckoutPayload({
  ...base,
  productKey: "elite_desk_fee",
});
assert.equal(missingReferral.ok, false);

const validReferral = validateCheckoutPayload({
  ...base,
  productKey: "elite_desk_fee",
  referralHasAgent: "yes",
  referralAgentName: "Alex Referral",
});
assert.equal(validReferral.ok, true);

assert.equal(normalizeWorkspaceRecoveryPhone("(929) 666-9886"), "+19296669886");
assert.equal(normalizeWorkspaceRecoveryPhone("1 929 666 9886"), "+19296669886");
assert.equal(normalizeWorkspaceRecoveryPhone("+44 20 7946 0958"), "+442079460958");
assert.equal(normalizeWorkspaceRecoveryPhone("12345"), undefined);

assert.equal(resolveWorkspaceRetentionDays(undefined), 30);
assert.equal(resolveWorkspaceRetentionDays("45"), 45);
assert.equal(resolveWorkspaceRetentionDays("7.8"), 7);
assert.equal(resolveWorkspaceRetentionDays("0"), 30);
assert.equal(resolveWorkspaceRetentionDays("not-a-number"), 30);

assert.equal(settledCheckoutAmountCents(8_400, 10_000), 8_400);
assert.equal(settledCheckoutAmountCents(0, 10_000), 0);
assert.equal(settledCheckoutAmountCents(null, 10_000), 10_000);
assert.equal(settledCheckoutAmountCents(8_400.5, 10_000), 10_000);

const metadata = {
  orderId: "123",
  productKey: "libor",
  agentId: "42",
  upgradeCreditCents: "0",
  licenseTransferFeeCents: "0",
};
const scopedMetadata = { ...metadata, app: "homixliving" };
const paymentSession = buildCheckoutSessionParams({
  billingMode: "payment",
  lineItems: [{ price: "price_service", quantity: 1 }],
  stripeCustomerId: "cus_returning",
  orderId: 123,
  metadata,
  description: "LIBOR - $618",
  hasLicenseTransferFee: false,
  automaticTaxEnabled: true,
  baseUrl: "https://agents.example.com",
});
assert.equal(paymentSession.customer, "cus_returning");
assert.equal("customer_email" in paymentSession, false);
assert.deepEqual(paymentSession.saved_payment_method_options, {
  payment_method_save: "enabled",
  payment_method_remove: "enabled",
});
assert.deepEqual(paymentSession.payment_intent_data, {
  metadata: scopedMetadata,
  description: "LIBOR - $618",
});
assert.deepEqual(paymentSession.metadata, scopedMetadata);
assert.equal(paymentSession.subscription_data, undefined);
assert.equal(paymentSession.allow_promotion_codes, true);
assert.deepEqual(paymentSession.automatic_tax, { enabled: true });
assert.equal(
  paymentSession.success_url,
  "https://agents.example.com/pay/success?session_id={CHECKOUT_SESSION_ID}",
);
assert.equal(paymentSession.cancel_url, "https://agents.example.com/pay?canceled=1");
assert.equal("setup_future_usage" in (paymentSession.payment_intent_data || {}), false);

const subscriptionSession = buildCheckoutSessionParams({
  billingMode: "subscription",
  lineItems: [
    { price: "price_plan", quantity: 1 },
    { price: "price_transfer", quantity: 1 },
  ],
  stripeCustomerId: "cus_subscriber",
  orderId: 124,
  metadata: { ...metadata, orderId: "124", productKey: "elite_desk_fee" },
  description: "Solo Pro + License Transfer - $3,670",
  couponId: "coupon_upgrade",
  hasLicenseTransferFee: true,
  automaticTaxEnabled: false,
  baseUrl: "https://agents.example.com",
});
assert.equal(subscriptionSession.mode, "subscription");
assert.equal(subscriptionSession.payment_intent_data, undefined);
assert.deepEqual(subscriptionSession.subscription_data, {
  metadata: {
    ...scopedMetadata,
    orderId: "124",
    productKey: "elite_desk_fee",
  },
  description: "Solo Pro + License Transfer - $3,670",
});
assert.deepEqual(subscriptionSession.discounts, [{ coupon: "coupon_upgrade" }]);
assert.equal(subscriptionSession.allow_promotion_codes, undefined);
assert.deepEqual(subscriptionSession.automatic_tax, { enabled: false });
assert.deepEqual(subscriptionSession.line_items, [
  { price: "price_plan", quantity: 1 },
  { price: "price_transfer", quantity: 1 },
]);

console.log("commerce checkout tests passed");
