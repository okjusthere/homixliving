import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  InvalidStripeCustomerError,
  StripeCustomerConflictError,
  checkoutCustomerOptions,
  chooseActiveSubscriptionCustomerId,
  isMissingStripeCustomerError,
  normalizeStripeCustomerId,
  resolveStripeCustomerForAgent,
  savedPaymentMethodOptions,
  stripeCustomerIdempotencyKey,
  syncAgentStripeCustomer,
  type StripeCustomerRepository,
} from "../commerce/stripe-customer";

type FakeRepositoryOptions = {
  active?: string[];
  latest?: string | null;
  canonical?: string | null;
  concurrentWinner?: string | null;
};

function fakeRepository(options: FakeRepositoryOptions = {}) {
  let canonical = options.canonical ?? null;
  const claims: string[] = [];
  const repository: StripeCustomerRepository = {
    async findActiveSubscriptionCustomerIds() {
      return options.active ?? [];
    },
    async findLatestPaidCustomerId() {
      return options.latest ?? null;
    },
    async claimCustomerId(_agentId, customerId) {
      claims.push(customerId);
      if (options.concurrentWinner) {
        canonical = options.concurrentWinner;
        return { customerId: canonical, claimed: false };
      }
      if (!canonical) {
        canonical = customerId;
        return { customerId, claimed: true };
      }
      return { customerId: canonical, claimed: false };
    },
  };
  return { repository, claims, getCanonical: () => canonical };
}

function fakeStripe(customerId = "cus_created123") {
  const calls: Array<{ params: Stripe.CustomerCreateParams; options?: Stripe.RequestOptions }> = [];
  const stripe = {
    customers: {
      async create(params: Stripe.CustomerCreateParams, options?: Stripe.RequestOptions) {
        calls.push({ params, options });
        return { id: customerId };
      },
    },
  } as unknown as Stripe;
  return { stripe, calls };
}

const agent = {
  id: 42,
  email: "agent@example.com",
  name: "Agent Display",
  legalName: "Agent Legal",
  stripeCustomerId: null,
};

async function main() {
assert.equal(normalizeStripeCustomerId(" cus_abc123 "), "cus_abc123");
assert.equal(normalizeStripeCustomerId("pm_abc123"), null);
assert.equal(normalizeStripeCustomerId(null), null);
assert.equal(isMissingStripeCustomerError({ code: "resource_missing", param: "customer" }), true);
assert.equal(isMissingStripeCustomerError({ code: "resource_missing", raw: { param: "customer" } }), true);
assert.equal(isMissingStripeCustomerError({ code: "card_declined", param: "customer" }), false);
assert.equal(chooseActiveSubscriptionCustomerId([]), null);
assert.equal(
  chooseActiveSubscriptionCustomerId(["cus_same", "cus_same"]),
  "cus_same",
);
assert.throws(
  () => chooseActiveSubscriptionCustomerId(["cus_first", "cus_second"]),
  StripeCustomerConflictError,
);
assert.throws(
  () => chooseActiveSubscriptionCustomerId(["not-a-customer"]),
  InvalidStripeCustomerError,
);
assert.equal(stripeCustomerIdempotencyKey(42), "homixliving-agent-42-stripe-customer-v1");
assert.deepEqual(savedPaymentMethodOptions(), {
  payment_method_save: "enabled",
  payment_method_remove: "enabled",
});
assert.deepEqual(checkoutCustomerOptions("cus_saved123"), {
  customer: "cus_saved123",
  saved_payment_method_options: {
    payment_method_save: "enabled",
    payment_method_remove: "enabled",
  },
});
assert.equal("customer_email" in checkoutCustomerOptions("cus_saved123"), false);
assert.throws(() => checkoutCustomerOptions("bad"), InvalidStripeCustomerError);

{
  const repo = fakeRepository();
  const stripe = fakeStripe();
  const customerId = await resolveStripeCustomerForAgent({
    agent: { ...agent, stripeCustomerId: "cus_existing" },
    stripe: stripe.stripe,
    repository: repo.repository,
  });
  assert.equal(customerId, "cus_existing");
  assert.equal(stripe.calls.length, 0);
  assert.deepEqual(repo.claims, []);
}

{
  const repo = fakeRepository({ active: ["cus_subscription"] });
  const stripe = fakeStripe();
  const customerId = await resolveStripeCustomerForAgent({
    agent,
    stripe: stripe.stripe,
    repository: repo.repository,
  });
  assert.equal(customerId, "cus_subscription");
  assert.deepEqual(repo.claims, ["cus_subscription"]);
  assert.equal(stripe.calls.length, 0);
}

{
  const repo = fakeRepository({ latest: "cus_latestpaid" });
  const stripe = fakeStripe();
  const customerId = await resolveStripeCustomerForAgent({
    agent,
    stripe: stripe.stripe,
    repository: repo.repository,
  });
  assert.equal(customerId, "cus_latestpaid");
  assert.deepEqual(repo.claims, ["cus_latestpaid"]);
  assert.equal(stripe.calls.length, 0);
}

{
  const repo = fakeRepository({ latest: "not-a-customer" });
  const stripe = fakeStripe();
  await assert.rejects(
    resolveStripeCustomerForAgent({ agent, stripe: stripe.stripe, repository: repo.repository }),
    InvalidStripeCustomerError,
  );
  assert.equal(stripe.calls.length, 0);
}

{
  const repo = fakeRepository();
  const stripe = fakeStripe("cus_newcustomer");
  const customerId = await resolveStripeCustomerForAgent({
    agent,
    stripe: stripe.stripe,
    repository: repo.repository,
  });
  assert.equal(customerId, "cus_newcustomer");
  assert.equal(repo.getCanonical(), "cus_newcustomer");
  assert.equal(stripe.calls.length, 1);
  assert.deepEqual(stripe.calls[0]?.params, {
    email: "agent@example.com",
    name: "Agent Legal",
    metadata: { agentId: "42", app: "homixliving", application: "homixliving" },
  });
  assert.equal(
    stripe.calls[0]?.options?.idempotencyKey,
    "homixliving-agent-42-stripe-customer-v1",
  );
}

{
  const repo = fakeRepository({ concurrentWinner: "cus_otherwinner" });
  const stripe = fakeStripe("cus_createdloser");
  const customerId = await resolveStripeCustomerForAgent({
    agent,
    stripe: stripe.stripe,
    repository: repo.repository,
  });
  assert.equal(customerId, "cus_otherwinner");
  assert.deepEqual(repo.claims, ["cus_createdloser"]);
}

{
  const repo = fakeRepository();
  const stripe = fakeStripe();
  await assert.rejects(
    resolveStripeCustomerForAgent({
      agent: { ...agent, stripeCustomerId: "invalid" },
      stripe: stripe.stripe,
      repository: repo.repository,
    }),
    InvalidStripeCustomerError,
  );
  assert.equal(stripe.calls.length, 0);
}

{
  const repo = fakeRepository();
  assert.deepEqual(
    await syncAgentStripeCustomer({
      agentId: 42,
      customerId: "cus_webhook",
      repository: repo.repository,
    }),
    { status: "attached", customerId: "cus_webhook" },
  );
  assert.deepEqual(
    await syncAgentStripeCustomer({
      agentId: 42,
      customerId: "cus_webhook",
      repository: repo.repository,
    }),
    { status: "matched", customerId: "cus_webhook" },
  );
}

{
  const repo = fakeRepository({ canonical: "cus_canonical" });
  assert.deepEqual(
    await syncAgentStripeCustomer({
      agentId: 42,
      customerId: "cus_conflicting",
      repository: repo.repository,
    }),
    { status: "conflict", customerId: "cus_canonical" },
  );
}

console.log("Stripe customer tests passed");
}

void main();
