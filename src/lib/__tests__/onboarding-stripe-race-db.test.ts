import assert from "node:assert/strict";
import { seedDosTestCompanies } from "./dos-db-fixture";
import { verifiedDosFixture } from "./dos-fixture";
import { randomUUID } from "node:crypto";
import { mock as testMock } from "node:test";
import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { db, closeDatabaseConnections } from "@/db";
import { agents, commerceCharges, commerceOrders, onboardingEvents, sponsorPlanRewards, type Agent, type CommerceOrder } from "@/db/schema";
import { onboardingReceipts } from "@/db/onboarding-schema";
import { completeOnboarding, recordOnboardingReceipt, runOnboardingCommand } from "@/lib/onboarding-admin";
import { onboardingFeeQuote } from "@/lib/onboarding-fees";
import {
  attachOnboardingCheckout, confirmOnboardingCheckoutExpired, markOnboardingCheckoutCreationFailed,
  reservePlanCheckout, settleOnboardingStripePayment, STRIPE_RECONCILIATION_EVENT,
  verifyOnboardingCheckoutsClosed, getOnboardingStaleSettlements, isOnboardingStripeOrder,
} from "@/lib/onboarding-stripe-guard";
import { withStripeAppMetadata } from "@/lib/commerce/stripe-app";
import { nyDate } from "@/lib/celebrations/calendar";
import { getStripe } from "@/lib/stripe";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) &&
    url.pathname === "/homix_onboarding_integration", "Dedicated local test database only (local and CI ports may differ)");
  process.env.ONBOARDING_V2_ENFORCED = "1";
  await seedDosTestCompanies();
  const [admin, sponsor] = await db.insert(agents).values([
    { name: "Synthetic Stripe Race Admin", email: `qa-${randomUUID()}@example.invalid`, accountStatus: "active" as const, isAdmin: true },
    { name: "Synthetic Stripe Race Sponsor", email: `qa-${randomUUID()}@example.invalid`, accountStatus: "active" as const },
  ]).returning();
  const subject = async (overrides: Partial<typeof agents.$inferInsert> = {}) => (await db.insert(agents).values({
    name: "Synthetic Preferred",
    ...verifiedDosFixture,
    email: `qa-${randomUUID()}@example.invalid`, accountStatus: "pending", plan: "solo", affiliationTermMonths: 12,
    onboardingCompletedAt: new Date().toISOString(), agreementStatus: "sent",
    signingRequestId: randomUUID(), agreementAgentSignedAt: new Date().toISOString(), referredByAgentId: sponsor.id, ...overrides,
  }).returning())[0];
  const fresh = async (id: number) => (await db.select().from(agents).where(eq(agents.id, id)))[0];
  const orderValues = (agent: Agent) => ({ agentId: agent.id, productKey: "one_year_membership", productName: "Synthetic membership",
    billingMode: "payment", amountCents: 30800, licenseTransferFeeCents: 2000, currency: "usd", paymentChannel: "stripe",
    status: "pending", customerEmail: agent.email });
  const legacyOrder = async (agent: Agent) => (await db.insert(commerceOrders).values(orderValues(agent)).returning())[0];
  const waiver = () => ({ action: "complete_onboarding", mode: "waiver", confirmed: true,
    idempotencyKey: randomUUID(), waiverAmountCents: 30800, reason: "Synthetic approved full company waiver" });
  const payment = () => ({ action: "complete_onboarding", mode: "payment", confirmed: true, idempotencyKey: randomUUID(),
    receipt: { amountCents: 30800, currency: "usd", method: "check", reference: `race-${randomUUID()}`, receivedAt: nyDate() } });
  const session = (order: CommerceOrder, overrides: Partial<Stripe.Checkout.Session> = {}) => ({
    id: `cs_test_${randomUUID()}`, object: "checkout.session", status: "open", payment_status: "unpaid", mode: "payment",
    metadata: withStripeAppMetadata({ orderId: String(order.id), agentId: String(order.agentId) }),
    amount_total: 30800, currency: "usd", customer: null, subscription: null, payment_intent: null,
    url: "https://example.invalid/mock-checkout", ...overrides,
  }) as Stripe.Checkout.Session;
  const settle = (order: CommerceOrder, mock: Stripe.Checkout.Session) => settleOnboardingStripePayment(order, {
    sourceKey: `checkout:${mock.id}`, eventId: `evt_test_${randomUUID()}`, amountCents: 30800, currency: "usd",
    earnedAt: new Date().toISOString(), kind: "checkout", session: { ...mock, status: "complete", payment_status: "paid" },
    patch: { status: "paid", stripeCheckoutSessionId: mock.id },
  });
  const rewards = (id: number) => db.select().from(sponsorPlanRewards).where(eq(sponsorPlanRewards.referredAgentId, id));
  const reconciliation = (id: number) => db.select().from(onboardingEvents).where(and(
    eq(onboardingEvents.agentId, id), eq(onboardingEvents.eventType, STRIPE_RECONCILIATION_EVENT)));

  // Model a paused Stripe create response: the committed reservation must already block approval.
  const creating = await subject();
  const reservation = await reservePlanCheckout(creating, orderValues(creating));
  let finishCreate!: () => void;
  const createResponse = new Promise<void>((resolve) => { finishCreate = resolve; });
  const mock = session(reservation);
  const inFlightCreate = (async () => { await createResponse; await attachOnboardingCheckout(reservation, mock); })();
  await assert.rejects(completeOnboarding(creating.id, admin.id, waiver()), /Stripe checkout/);
  assert.equal((await fresh(creating.id)).accountStatus, "pending");
  finishCreate(); await inFlightCreate;
  await assert.rejects(verifyOnboardingCheckoutsClosed(creating.id, async () => mock), /has not expired/);
  await assert.rejects(verifyOnboardingCheckoutsClosed(creating.id, async () => ({ ...mock, status: "expired", metadata: { app: "foreign-app" } })), /ownership/);
  await verifyOnboardingCheckoutsClosed(creating.id, async () => ({ ...mock, status: "expired" }));
  await completeOnboarding(creating.id, admin.id, waiver());
  assert.equal((await fresh(creating.id)).paymentStatus, "not_required");
  console.log("PASS committed first-checkout reservation blocks concurrent approval until mocked Stripe confirms expiry");

  const unknown = await subject();
  const unknownOrder = await reservePlanCheckout(unknown, orderValues(unknown));
  await markOnboardingCheckoutCreationFailed(unknownOrder, true);
  await assert.rejects(completeOnboarding(unknown.id, admin.id, waiver()), /outcome is unknown/);
  await assert.rejects(reservePlanCheckout(await fresh(unknown.id), orderValues(unknown)), /Stripe checkout/);
  await assert.rejects(verifyOnboardingCheckoutsClosed(unknown.id, async () => { throw new Error("Must not call Stripe without an ID"); }), /missing session ID/);
  const neverCreated = await subject();
  const unused = await reservePlanCheckout(neverCreated, orderValues(neverCreated));
  await markOnboardingCheckoutCreationFailed(unused, false);
  await completeOnboarding(neverCreated.id, admin.id, waiver());
  console.log("PASS unknown create outcomes fail closed; proven pre-create failure can release its reservation");

  // Compete on the real advisory locks. Exactly one side may win, in either invocation order.
  for (const approvalFirst of [false, true, false, true]) {
    const agent = await subject();
    const actions = approvalFirst
      ? [completeOnboarding(agent.id, admin.id, waiver()), reservePlanCheckout(agent, orderValues(agent))]
      : [reservePlanCheckout(agent, orderValues(agent)), completeOnboarding(agent.id, admin.id, waiver())];
    const result = await Promise.allSettled(actions);
    assert.equal(result.filter(r => r.status === "fulfilled").length, 1);
    const current = await fresh(agent.id);
    const orders = await db.select().from(commerceOrders).where(eq(commerceOrders.agentId, agent.id));
    assert.ok((current.accountStatus === "active" && orders.length === 0) || (current.accountStatus === "pending" && orders.length === 1));
  }
  console.log("PASS concurrent first checkout versus approval has one winner; stale checkout never becomes an accidental renewal");

  // Pre-deployment/legacy late sessions can still deliver after a manual basis was committed.
  for (const mode of ["waiver", "offline"] as const) {
    const agent = await subject();
    const command = mode === "waiver" ? waiver() : payment();
    await completeOnboarding(agent.id, admin.id, command);
    const before = await fresh(agent.id);
    const late = await legacyOrder(agent);
    const lateSession = session(late);
    const [, result] = await Promise.all([completeOnboarding(agent.id, admin.id, command), settle(late, lateSession)]);
    assert.equal(result.reconciliationRequired, true);
    const after = await fresh(agent.id);
    assert.equal(after.paymentStatus, before.paymentStatus);
    assert.equal(after.affiliationPaidAt, before.affiliationPaidAt);
    assert.deepEqual(after.onboardingFeeAdjustment, before.onboardingFeeAdjustment);
    assert.equal(after.accountStatus, "active");
    assert.equal((await rewards(agent.id)).length, mode === "waiver" ? 0 : 1);
    assert.equal((await rewards(agent.id))[0]?.amountCents ?? 0, mode === "waiver" ? 0 : 2880);
    const [realIncome] = await db.select().from(commerceOrders).where(eq(commerceOrders.id, late.id));
    assert.equal(realIncome.amountCents, 30800); assert.equal(realIncome.status, "paid"); assert.ok(realIncome.paidAt);
    await Promise.all([settle(late, lateSession), settle(late, lateSession)]);
    assert.equal((await reconciliation(agent.id)).length, 1);
    assert.equal(await confirmOnboardingCheckoutExpired(realIncome, { ...lateSession, status: "expired" }), false);
    assert.equal((await db.select().from(commerceOrders).where(eq(commerceOrders.id, late.id)))[0].status, "paid");
    await settleOnboardingStripePayment(late, { sourceKey: `invoice:mock-${randomUUID()}`, eventId: `evt_mock_${randomUUID()}`,
      amountCents: 28800, currency: "usd", earnedAt: new Date().toISOString(), kind: "renewal", patch: { status: "active" } });
    assert.equal((await rewards(agent.id)).length, mode === "waiver" ? 0 : 1, "A renewal of a reconciled subscription must not add another reward");
    assert.equal((await fresh(agent.id)).paymentStatus, before.paymentStatus);
    assert.equal((await db.select().from(onboardingReceipts).where(eq(onboardingReceipts.agentId, agent.id))).length, mode === "waiver" ? 0 : 1);
  }
  console.log("PASS late payment versus waiver/offline replay retains real income, flags reconciliation, preserves basis and prevents second rewards/refunds");

  // A real later subscription service cycle is not covered by the original onboarding waiver/receipt.
  for (const mode of ["waiver", "offline"] as const) {
    const agent = await subject({ plan: "solo_pro" });
    const total = onboardingFeeQuote(agent).originalAmountCents;
    const paidCommand = payment();
    await completeOnboarding(agent.id, admin.id, mode === "waiver"
      ? { ...waiver(), waiverAmountCents: total }
      : { ...paidCommand, receipt: { ...paidCommand.receipt, amountCents: total } });
    const before = await fresh(agent.id);
    const [order] = await db.insert(commerceOrders).values({ ...orderValues(agent),
      productKey: "elite_desk_fee", billingMode: "subscription", amountCents: total }).returning();
    const invoice = (period: string | null) => ({ sourceKey: `invoice:cycle-${randomUUID()}`, eventId: `evt_mock_${randomUUID()}`,
      amountCents: total - 2000, currency: "usd", earnedAt: new Date().toISOString(), kind: "renewal" as const,
      renewalCycleStart: period, patch: { status: "active" } });
    const currentTerm = await settleOnboardingStripePayment(order, invoice(`${before.anniversaryStart}T12:00:00Z`));
    assert.equal(currentTerm.reconciliationRequired, true);
    const countBefore = (await rewards(agent.id)).length;
    const nextYear = new Date(`${before.anniversaryStart}T12:00:00Z`);
    nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
    const nextCycle = invoice(nextYear.toISOString());
    assert.equal((await settleOnboardingStripePayment(order, nextCycle)).reconciliationRequired, false);
    await settleOnboardingStripePayment(order, nextCycle);
    assert.equal((await rewards(agent.id)).length, countBefore + 1);
    assert.equal((await fresh(agent.id)).paymentStatus, "paid");
    assert.deepEqual((await fresh(agent.id)).onboardingFeeAdjustment, before.onboardingFeeAdjustment);
    const staleSettlements = await getOnboardingStaleSettlements([agent.id]);
    assert.equal(staleSettlements.length, 1, "A legitimate later renewal does not erase unresolved earlier money");
    assert.equal(staleSettlements[0].orderId, order.id);
    assert.equal(staleSettlements[0].actualAmountCents, total - 2000);
    assert.ok(staleSettlements[0].reason);
    const renewalOrder = await reservePlanCheckout(await fresh(agent.id), { ...orderValues(agent),
      productKey: "elite_desk_fee", billingMode: "subscription", amountCents: total - 2000, licenseTransferFeeCents: 0 });
    assert.equal(isOnboardingStripeOrder(renewalOrder), false, "Later legitimate checkout is outside the initial-onboarding guard");
    assert.equal(isOnboardingStripeOrder({ ...order, productKey: "company_domain_email", licenseTransferFeeCents: 0 }), false);
  }
  console.log("PASS current-term duplicates require reconciliation; later subscription cycles/renewal checkouts and addons are not lifetime-waived");

  const verified = await subject();
  const actual = await recordOnboardingReceipt(admin.id, { agentId: verified.id, amountCents: 30800,
    method: "check", reference: `verified-${randomUUID()}`, receivedAt: nyDate(), idempotencyKey: randomUUID() });
  await runOnboardingCommand(verified.id, admin.id, { action: "match_receipt", receiptId: actual.receipt.id });
  const open = await legacyOrder(verified);
  const openSession = session(open); await attachOnboardingCheckout(open, openSession);
  const verifyCommand = { action: "complete_onboarding", mode: "verified", confirmed: true, idempotencyKey: randomUUID() };
  await assert.rejects(completeOnboarding(verified.id, admin.id, verifyCommand), /Stripe checkout/);
  await verifyOnboardingCheckoutsClosed(verified.id, async () => ({ ...openSession, status: "expired" }));
  await completeOnboarding(verified.id, admin.id, verifyCommand);
  console.log("PASS verified mode also refuses an open checkout until expiry is verified");

  const online = await subject();
  const onlineOrder = await reservePlanCheckout(online, orderValues(online));
  const onlineSession = session(onlineOrder);
  const competitors = await Promise.allSettled([settle(onlineOrder, onlineSession), completeOnboarding(online.id, admin.id, waiver())]);
  assert.equal(competitors[0].status, "fulfilled"); assert.equal(competitors[1].status, "rejected");
  assert.equal((await fresh(online.id)).paymentStatus, "paid");
  assert.equal((await fresh(online.id)).onboardingFeeAdjustment, null);
  await settle(onlineOrder, onlineSession);
  await attachOnboardingCheckout(onlineOrder, onlineSession);
  assert.equal((await rewards(online.id)).length, 1);
  assert.equal((await db.select().from(commerceOrders).where(eq(commerceOrders.id, onlineOrder.id)))[0].status, "paid");
  console.log("PASS webhook versus manual approval serializes; delayed create response and webhook retries do not downgrade or duplicate payment");

  const invoiced = await subject();
  const invoicedOrder = await reservePlanCheckout(invoiced, orderValues(invoiced));
  await settleOnboardingStripePayment(invoicedOrder, { sourceKey: `invoice:initial-${randomUUID()}`, eventId: `evt_mock_${randomUUID()}`,
    amountCents: 30800, currency: "usd", earnedAt: new Date().toISOString(), kind: "initial_invoice", patch: { status: "active" } });
  assert.equal((await rewards(invoiced.id)).length, 0);
  assert.equal((await fresh(invoiced.id)).accountStatus, "pending");
  await assert.rejects(reservePlanCheckout(await fresh(invoiced.id), orderValues(invoiced)), /already paid|awaiting/);
  assert.equal((await db.select().from(commerceOrders).where(eq(commerceOrders.agentId, invoiced.id))).length, 1);
  const originalSession = session(invoicedOrder);
  await settle(invoicedOrder, originalSession);
  await settle(invoicedOrder, originalSession);
  assert.equal((await rewards(invoiced.id)).length, 1);
  assert.equal((await fresh(invoiced.id)).paymentStatus, "paid");
  assert.equal(onboardingFeeQuote(await fresh(invoiced.id)).waivedAmountCents, 0);
  console.log("PASS initial invoice blocks a second checkout while agent is pending; original completion/replay yields one reward");

  const foreign = await subject();
  const foreignOrder = await reservePlanCheckout(foreign, orderValues(foreign));
  await assert.rejects(settle(foreignOrder, session(foreignOrder, { metadata: { app: "other-app", orderId: String(foreignOrder.id) } })), /ownership/);
  assert.equal((await fresh(foreign.id)).paymentStatus, "pending");
  assert.equal((await rewards(foreign.id)).length, 0);
  console.log("PASS shared-account foreign metadata cannot mutate onboarding payment state");

  // Exercise the legacy route's fresh-read boundary with a mocked SDK and test-only identity.
  const authBootstrap = new URL("../../../scripts/test-agreement-auth.mjs", import.meta.url).href;
  await import(authBootstrap);
  const globals = globalThis as typeof globalThis & { __agreementTestSession: unknown };
  const savedKey = process.env.STRIPE_SECRET_KEY;
  const savedWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = "sk_test_synthetic_mock_only";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_synthetic_mock_only";
  globals.__agreementTestSession = { user: { agentId: admin.id, email: admin.email, accountStatus: "active", isAdmin: true } };
  try {
    const { POST: approve } = await import("@/app/api/agents/[id]/approve/route");
    const { NextRequest } = await import("next/server");
    const legacy = await subject({ signingRequestId: null, onboardingCompletedAt: null, agreementAgentSignedAt: null });
    const checkout = await legacyOrder(legacy);
    const sdkSession = session(checkout); await attachOnboardingCheckout(checkout, sdkSession);
    let providerState: "open" | "expired" | "unavailable" = "open";
    testMock.method(getStripe().checkout.sessions, "retrieve", async (id: string, _params: unknown, options: unknown) => {
      assert.equal(id, sdkSession.id);
      assert.deepEqual(options, { timeout: 5000, maxNetworkRetries: 0 });
      if (providerState === "unavailable") throw new Error("Mocked Stripe outage");
      return { ...sdkSession, status: providerState };
    });
    testMock.method(globalThis, "fetch", async () => { throw new Error("No external HTTP is allowed in this route regression"); });
    const call = async () => {
      const result = await approve(new NextRequest(`http://localhost/api/agents/${legacy.id}/approve`, {
        method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: "{}",
      }), { params: Promise.resolve({ id: String(legacy.id) }) });
      assert.ok(result);
      return result;
    };
    let response = await call(); assert.equal(response.status, 409); assert.match((await response.json()).error, /has not expired/);
    providerState = "unavailable";
    response = await call(); assert.equal(response.status, 409); assert.match((await response.json()).error, /Could not verify closure/);
    providerState = "expired";
    response = await call(); assert.equal(response.status, 409); assert.match((await response.json()).error, /not completed their onboarding profile/);
    assert.equal((await db.select().from(commerceOrders).where(eq(commerceOrders.id, checkout.id)))[0].status, "expired");
    assert.equal((await fresh(legacy.id)).accountStatus, "pending", "Expiry proof does not bypass contract/profile eligibility");

    const { POST: webhook } = await import("@/app/api/stripe/webhook/route");
    const invoiceEvent = async (invoice: Stripe.Invoice, type: "invoice.payment_succeeded" | "invoice.payment_failed") => {
      const payload = JSON.stringify({ id: `evt_mock_${randomUUID()}`, type, data: { object: invoice } });
      const signature = getStripe().webhooks.generateTestHeaderString({ payload, secret: "whsec_synthetic_mock_only" });
      const response = await webhook(new Request("http://localhost/api/stripe/webhook", {
        method: "POST", headers: { "stripe-signature": signature }, body: payload,
      }));
      assert.equal(response.status, 200, JSON.stringify(await response.json()));
    };
    for (const onboarding of [true, false]) {
      const agent = await subject({ plan: "solo_pro" });
      const subscriptionId = `sub_mock_${randomUUID()}`;
      const [order] = await db.insert(commerceOrders).values({ ...orderValues(agent),
        productKey: onboarding ? "elite_desk_fee" : "libor", billingMode: "subscription",
        amountCents: 367000, licenseTransferFeeCents: onboarding ? 2000 : 0, stripeSubscriptionId: subscriptionId }).returning();
      const paidInvoice = {
        id: `in_mock_${randomUUID()}`, object: "invoice", amount_paid: 367000, amount_due: 367000, currency: "usd",
        billing_reason: "subscription_create", parent: { subscription_details: {
          subscription: subscriptionId, metadata: withStripeAppMetadata({ orderId: String(order.id) }),
        } }, status_transitions: { paid_at: 1789401600 }, period_start: 1789401600, period_end: 1820937600,
        lines: { data: [{ period: { start: 1789401600, end: 1820937600 }, description: "Synthetic invoice" }] },
      } as unknown as Stripe.Invoice;
      const failedInvoice = { ...paidInvoice, amount_paid: 0, amount_due: 1, status_transitions: { paid_at: null } } as Stripe.Invoice;
      const charge = async (id: string) => (await db.select().from(commerceCharges).where(eq(commerceCharges.stripeInvoiceId, id)))[0];
      const currentOrder = async () => (await db.select().from(commerceOrders).where(eq(commerceOrders.id, order.id)))[0];
      await invoiceEvent(paidInvoice, "invoice.payment_succeeded");
      const paidCharge = await charge(paidInvoice.id);
      const paidOrder = await currentOrder();
      await invoiceEvent(failedInvoice, "invoice.payment_failed");
      assert.equal((await charge(paidInvoice.id)).status, "paid");
      assert.equal((await charge(paidInvoice.id)).amountCents, paidCharge.amountCents);
      assert.equal((await charge(paidInvoice.id)).paidAt, paidCharge.paidAt);
      assert.equal((await currentOrder()).status, "active");
      assert.equal((await currentOrder()).paidAt, paidOrder.paidAt);

      // Same invoice concurrent deliveries must converge to paid, independent of invocation order.
      for (const paidFirst of [false, true]) {
        const id = `in_mock_${randomUUID()}`;
        const paid = () => invoiceEvent({ ...paidInvoice, id }, "invoice.payment_succeeded");
        const failed = () => invoiceEvent({ ...failedInvoice, id }, "invoice.payment_failed");
        await Promise.all(paidFirst ? [paid(), failed()] : [failed(), paid()]);
        assert.equal((await charge(id)).status, "paid");
        assert.equal((await charge(id)).amountCents, 367000);
        assert.ok((await charge(id)).paidAt);
        assert.equal((await currentOrder()).status, "active");
      }

      const laterFailure = { ...failedInvoice, id: `in_mock_${randomUUID()}`, billing_reason: "subscription_cycle" as const };
      await invoiceEvent(laterFailure, "invoice.payment_failed");
      assert.equal((await charge(laterFailure.id)).status, "failed");
      assert.equal((await currentOrder()).status, "past_due", "A different unpaid renewal invoice must still report failure");
      await invoiceEvent(failedInvoice, "invoice.payment_failed");
      assert.equal((await currentOrder()).status, "past_due", "An old failed delivery must neither restore nor downgrade current subscription status");
      assert.equal((await charge(paidInvoice.id)).status, "paid");
      assert.equal((await rewards(agent.id)).length, 0, "Invoice ordering alone must not mint initial sponsor rewards");
    }
    console.log("PASS signed webhook invoice paid facts are monotone across late/concurrent failures; distinct renewal failures remain past_due");
  } finally {
    testMock.restoreAll(); globals.__agreementTestSession = null;
    if (savedKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = savedKey;
    if (savedWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = savedWebhookSecret;
  }
  console.log("PASS legacy approval uses bounded fresh Stripe reads, maps open/unavailable to 409, and preserves eligibility gates");
}
main().finally(closeDatabaseConnections).catch(error => { console.error(error); process.exitCode = 1; });
