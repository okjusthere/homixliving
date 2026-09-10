import { loadEnvConfig } from "@next/env";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Stripe from "stripe";
import { buildCheckoutSessionParams } from "../src/lib/commerce/checkout-session";
import { STRIPE_APP_ID, withStripeAppMetadata } from "../src/lib/commerce/stripe-app";

// Standalone scripts otherwise default to Next's production env loading order,
// which could select .env.production.local. Smoke tests must use .env.local.
loadEnvConfig(process.cwd(), true);

const statePath = join(process.cwd(), ".stripe-test-smoke.json");

type SmokeState = {
  runId: string;
  customerId: string;
  firstSessionId: string;
  returnSessionId?: string;
  subscriptionSessionId?: string;
  declineSessionId?: string;
};

function stripeClient(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY?.trim() || "";
  if (!/^(sk|rk)_test_/.test(secret)) {
    throw new Error("Smoke test requires a Stripe test-mode key in .env.local.");
  }
  return new Stripe(secret);
}

function priceId(name: string): string {
  const value = process.env[name]?.trim();
  if (!value?.startsWith("price_")) throw new Error(`${name} is not configured.`);
  return value;
}

async function readState(): Promise<SmokeState> {
  return JSON.parse(await readFile(statePath, "utf8")) as SmokeState;
}

async function saveState(state: SmokeState) {
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function assertOwnedCustomer(stripe: Stripe, state: SmokeState) {
  const customer = await stripe.customers.retrieve(state.customerId);
  if (customer.deleted || customer.metadata.app !== STRIPE_APP_ID || customer.metadata.purpose !== "saved-card-smoke") {
    throw new Error("Refusing to operate on a Customer outside this Homix smoke run.");
  }
  return customer;
}

async function createCheckout(
  stripe: Stripe,
  state: SmokeState,
  kind: "first" | "return" | "subscription" | "decline",
): Promise<Stripe.Checkout.Session> {
  const isSubscription = kind === "subscription";
  const metadata = withStripeAppMetadata({
    purpose: "saved-card-smoke",
    smokeRunId: state.runId,
    smokeStep: kind,
    orderId: kind === "first" ? "900001" : kind === "return" ? "900002" : kind === "subscription" ? "900003" : "900004",
    agentId: "900001",
    productKey: isSubscription ? "company_domain_email" : "transfer_fee",
  });
  return stripe.checkout.sessions.create(buildCheckoutSessionParams({
    billingMode: isSubscription ? "subscription" : "payment",
    lineItems: [{
      price: priceId(
        isSubscription
          ? "STRIPE_PRICE_COMPANY_DOMAIN_EMAIL_MONTHLY"
          : "STRIPE_PRICE_TRANSFER_FEE",
      ),
      quantity: 1,
    }],
    stripeCustomerId: state.customerId,
    orderId: Number(metadata.orderId),
    metadata,
    description: isSubscription
      ? "Homix Stripe smoke test - monthly subscription"
      : `Homix Stripe smoke test - ${kind} purchase`,
    hasLicenseTransferFee: false,
    automaticTaxEnabled: false,
    baseUrl: "https://example.com",
  }));
}

async function setup(stripe: Stripe) {
  try {
    await readFile(statePath, "utf8");
    throw new Error("A smoke run already exists. Finish it or run cleanup first.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const runId = new Date().toISOString().replace(/\D/g, "");
  const customer = await stripe.customers.create({
    email: `stripe-smoke+${runId}@example.invalid`,
    name: "Homix Stripe Smoke Test",
    metadata: withStripeAppMetadata({
      purpose: "saved-card-smoke",
      smokeRunId: runId,
      agentId: "900001",
    }),
  }, { idempotencyKey: `homixliving-saved-card-smoke-${runId}` });
  const state: SmokeState = { runId, customerId: customer.id, firstSessionId: "" };
  const session = await createCheckout(stripe, state, "first");
  state.firstSessionId = session.id;
  await saveState(state);
  console.log("FIRST_PURCHASE_URL=" + session.url);
  console.log("Use Stripe test card 4242 4242 4242 4242, any future expiry/CVC, and opt in to save it.");
}

async function createReturn(stripe: Stripe) {
  const state = await readState();
  await assertOwnedCustomer(stripe, state);
  const first = await stripe.checkout.sessions.retrieve(state.firstSessionId);
  if (first.payment_status !== "paid") throw new Error("First Checkout has not completed successfully.");
  const methods = await stripe.paymentMethods.list({ customer: state.customerId, type: "card", limit: 100 });
  if (!methods.data.length) throw new Error("No saved card found; complete Checkout and opt in to save the card.");
  const session = state.returnSessionId
    ? await stripe.checkout.sessions.retrieve(state.returnSessionId)
    : await createCheckout(stripe, state, "return");
  state.returnSessionId = session.id;
  await saveState(state);
  console.log(`SAVED_CARD_COUNT=${methods.data.length}`);
  console.log("RETURN_PURCHASE_URL=" + session.url);
}

async function createSubscription(stripe: Stripe) {
  const state = await readState();
  await assertOwnedCustomer(stripe, state);
  if (!state.returnSessionId) throw new Error("Create and complete the return purchase first.");
  const returned = await stripe.checkout.sessions.retrieve(state.returnSessionId);
  if (returned.payment_status !== "paid") throw new Error("Return Checkout has not completed successfully.");
  const session = state.subscriptionSessionId
    ? await stripe.checkout.sessions.retrieve(state.subscriptionSessionId)
    : await createCheckout(stripe, state, "subscription");
  state.subscriptionSessionId = session.id;
  await saveState(state);
  console.log("SUBSCRIPTION_URL=" + session.url);
}

async function createPortal(stripe: Stripe) {
  const state = await readState();
  await assertOwnedCustomer(stripe, state);
  if (!state.subscriptionSessionId) throw new Error("Create and complete the subscription first.");
  const subscribed = await stripe.checkout.sessions.retrieve(state.subscriptionSessionId);
  if (subscribed.payment_status !== "paid" || !subscribed.subscription) {
    throw new Error("Subscription Checkout has not completed successfully.");
  }
  const configuration = process.env.STRIPE_CUSTOMER_PORTAL_CONFIGURATION?.trim();
  const portal = await stripe.billingPortal.sessions.create({
    customer: state.customerId,
    configuration: configuration || undefined,
    return_url: "https://example.com",
  });
  console.log("BILLING_PORTAL_URL=" + portal.url);
}

async function createDecline(stripe: Stripe) {
  const state = await readState();
  await assertOwnedCustomer(stripe, state);
  const session = state.declineSessionId
    ? await stripe.checkout.sessions.retrieve(state.declineSessionId)
    : await createCheckout(stripe, state, "decline");
  state.declineSessionId = session.id;
  await saveState(state);
  console.log("DECLINE_TEST_URL=" + session.url);
  console.log("Use test card 4000 0000 0000 0002 and confirm the decline is recoverable.");
}

async function verifyRemoval(stripe: Stripe) {
  const state = await readState();
  await assertOwnedCustomer(stripe, state);
  const extra = await stripe.paymentMethods.create({
    type: "card",
    card: { token: "tok_mastercard" },
    billing_details: { name: "Homix removable test card" },
  });
  await stripe.paymentMethods.attach(extra.id, { customer: state.customerId });
  await stripe.paymentMethods.update(extra.id, { allow_redisplay: "always" });
  const before = await stripe.paymentMethods.list({ customer: state.customerId, type: "card", limit: 100 });
  await stripe.paymentMethods.detach(extra.id);
  const after = await stripe.paymentMethods.list({ customer: state.customerId, type: "card", limit: 100 });
  if (!before.data.some((method) => method.id === extra.id) || after.data.some((method) => method.id === extra.id)) {
    throw new Error("Saved-card removal verification failed.");
  }
  console.log(`removal: before=${before.data.length}, after=${after.data.length}, verified=true`);
}

async function status(stripe: Stripe) {
  const state = await readState();
  await assertOwnedCustomer(stripe, state);
  const methods = await stripe.paymentMethods.list({ customer: state.customerId, type: "card", limit: 100 });
  for (const [label, sessionId] of [
    ["first", state.firstSessionId],
    ["return", state.returnSessionId],
    ["subscription", state.subscriptionSessionId],
    ["decline", state.declineSessionId],
  ] as const) {
    if (!sessionId) continue;
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log(`${label}: status=${session.status}, payment=${session.payment_status}`);
  }
  console.log(`saved_cards=${methods.data.length}`);
}

async function cleanup(stripe: Stripe) {
  const state = await readState();
  await assertOwnedCustomer(stripe, state);
  await stripe.customers.del(state.customerId);
  await unlink(statePath);
  console.log("Deleted the synthetic Stripe test Customer and local smoke state.");
}

async function main() {
  const command = process.argv[2];
  const stripe = stripeClient();
  if (command === "setup") return setup(stripe);
  if (command === "return") return createReturn(stripe);
  if (command === "subscription") return createSubscription(stripe);
  if (command === "portal") return createPortal(stripe);
  if (command === "decline") return createDecline(stripe);
  if (command === "removal") return verifyRemoval(stripe);
  if (command === "status") return status(stripe);
  if (command === "cleanup") return cleanup(stripe);
  throw new Error("Usage: npm run stripe:test:smoke -- setup|return|subscription|portal|decline|removal|status|cleanup");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
