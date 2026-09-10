import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  STRIPE_APP_ID,
  invoiceSubscriptionMetadata,
  shouldHandleStripeScope,
  stripeMetadataScope,
  withStripeAppMetadata,
} from "../commerce/stripe-app";

assert.equal(STRIPE_APP_ID, "homixliving");
assert.deepEqual(withStripeAppMetadata({ orderId: "42" }), {
  orderId: "42",
  app: "homixliving",
});
assert.equal(stripeMetadataScope({ app: "homixliving" }), "owned");
assert.equal(stripeMetadataScope({ app: "another-app" }), "foreign");
assert.equal(stripeMetadataScope({}), "legacy");
assert.equal(stripeMetadataScope(null), "legacy");
assert.equal(shouldHandleStripeScope("owned", false), true);
assert.equal(shouldHandleStripeScope("foreign", true), false);
assert.equal(shouldHandleStripeScope("legacy", true), true);
assert.equal(shouldHandleStripeScope("legacy", false), false);

const ownedInvoice = {
  parent: {
    subscription_details: {
      metadata: { app: "homixliving", orderId: "42" },
    },
  },
} as unknown as Stripe.Invoice;
assert.deepEqual(invoiceSubscriptionMetadata(ownedInvoice), {
  app: "homixliving",
  orderId: "42",
});
assert.equal(
  invoiceSubscriptionMetadata({ parent: null } as Stripe.Invoice),
  null,
);

console.log("Stripe app isolation tests passed");
