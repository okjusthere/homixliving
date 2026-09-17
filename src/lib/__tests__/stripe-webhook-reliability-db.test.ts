import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mock } from "node:test";
import postgres from "postgres";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";

const configured = new URL(process.env.DATABASE_URL || "postgres://postgres@localhost:5499/homixliving");
assert.ok(["127.0.0.1", "localhost"].includes(configured.hostname), "Local disposable database only");
const databaseName = `homix_stripe_${randomUUID().replaceAll("-", "")}`;
const adminUrl = new URL(configured); adminUrl.pathname = "/postgres";
const testUrl = new URL(configured); testUrl.pathname = `/${databaseName}`;
process.env.DATABASE_URL = testUrl.toString();
process.env.STRIPE_SECRET_KEY = "sk_test_mock_no_network";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock_no_network";
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });

async function main() {
  await admin.unsafe(`CREATE DATABASE ${databaseName}`);
  const { db, pgClient, closeDatabaseConnections } = await import("@/db");
  const { closeStripeEventProcessingConnections } = await import("@/lib/commerce/stripe-event-processing");
  try {
    const { ensureSchema } = await import("@/db/ensure-schema");
    await ensureSchema(pgClient);
    const { agents, commerceOrders, commerceCharges, stripeEvents, sponsorPlanRewards } = await import("@/db/schema");
    const { getStripe } = await import("@/lib/stripe");
    const { POST } = await import("@/app/api/stripe/webhook/route");
    const sdk = getStripe();
    const subscriptions = new Map<string, Stripe.Subscription>();
    const invoices = new Map<string, Stripe.Invoice>();
    const sessions = new Map<string, Stripe.Checkout.Session>();
    let outage = false;
    let reads = 0;
    let pauseInvoiceId: string | null = null;
    let providerStarted = () => {};
    let resumeProvider: Promise<void> = Promise.resolve();
    const read = <T>(map: Map<string, T>, id: string, options: unknown) => {
      assert.deepEqual(options, { timeout: 5000, maxNetworkRetries: 0 }); reads++;
      if (outage) throw new Error("Synthetic Stripe outage");
      assert.ok(map.has(id), `Unmocked provider read ${id}`);
      return structuredClone(map.get(id)!);
    };
    mock.method(sdk.invoices, "retrieve", async (id: string, _params: unknown, opts: unknown) => {
      if (id === pauseInvoiceId) { providerStarted(); await resumeProvider; }
      return read(invoices, id, opts);
    });
    mock.method(sdk.subscriptions, "retrieve", async (id: string, _params: unknown, opts: unknown) => read(subscriptions, id, opts));
    mock.method(sdk.checkout.sessions, "retrieve", async (id: string, _params: unknown, opts: unknown) => read(sessions, id, opts));
    mock.method(globalThis, "fetch", async () => { throw new Error("External HTTP forbidden in regression"); });
    let provisions = 0;
    let suspensions = 0;
    (globalThis as unknown as { __stripeWorkspaceTest: unknown }).__stripeWorkspaceTest = {
      provision: async (order: typeof commerceOrders.$inferSelect) => {
        if (order.workspaceStatus === "provisioned") return;
        provisions++;
        await db.update(commerceOrders).set({ workspaceStatus: "provisioned" }).where(eq(commerceOrders.id, order.id));
      },
      suspend: async (order: typeof commerceOrders.$inferSelect) => {
        suspensions++;
        await db.update(commerceOrders).set({ workspaceStatus: "suspended" }).where(eq(commerceOrders.id, order.id));
      },
    };
    const [sponsor, agent] = await db.insert(agents).values([
      { name: "Synthetic Sponsor", email: "sponsor@example.invalid", accountStatus: "active" as const },
      { name: "Synthetic Subscriber", email: "subscriber@example.invalid", accountStatus: "active" as const, plan: "solo_pro" as const },
    ]).returning();
    await db.update(agents).set({ referredByAgentId: sponsor.id }).where(eq(agents.id, agent.id));
    const makeOrder = async (productKey = "company_domain_email") => {
      const sub = `sub_mock_${randomUUID()}`;
      const [order] = await db.insert(commerceOrders).values({ agentId: agent.id, productKey,
        productName: "Synthetic", billingMode: "subscription", amountCents: 1030, currency: "usd", status: "pending",
        stripeSubscriptionId: sub, workspaceStatus: "pending", workspaceUserId: "synthetic-owned-user",
      }).returning();
      subscriptions.set(sub, { id: sub, object: "subscription", status: "active", cancel_at: null,
        cancel_at_period_end: false, metadata: { app: "homixliving", orderId: String(order.id) },
      } as unknown as Stripe.Subscription);
      return order;
    };
    const makeInvoice = (order: typeof commerceOrders.$inferSelect, paid = true, paidAt = 1789401600) => {
      const invoice = { id: `in_mock_${randomUUID()}`, object: "invoice", status: paid ? "paid" : "open",
        amount_paid: paid ? 1030 : 0, amount_due: 1030, currency: "usd", billing_reason: "subscription_cycle",
        status_transitions: { paid_at: paid ? paidAt : null }, period_start: paidAt, period_end: paidAt + 86400,
        parent: { subscription_details: { subscription: order.stripeSubscriptionId, metadata: { app: "homixliving" } } },
        lines: { data: [{ description: "Synthetic invoice", period: { start: paidAt, end: paidAt + 86400 } }] },
      } as unknown as Stripe.Invoice;
      invoices.set(invoice.id, invoice); return invoice;
    };
    const send = async (type: string, object: unknown, id = `evt_mock_${randomUUID()}`) => {
      const payload = JSON.stringify({ id, type, data: { object } });
      const signature = sdk.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
      return POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": signature } }));
    };
    const ok = async (type: string, object: unknown, id?: string) => {
      const response = await send(type, object, id);
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json())); return response.json();
    };
    const current = async (id: number) => (await db.select().from(commerceOrders).where(eq(commerceOrders.id, id)))[0];
    const marker = async (id: string) => (await db.select().from(stripeEvents).where(eq(stripeEvents.id, id)))[0];

    const order = await makeOrder(); const invoice = makeInvoice(order);
    // Migration does not blindly call all old claims completed, or reset new completions.
    await pgClient.unsafe("ALTER TABLE portal.stripe_events DROP COLUMN completed_at");
    await pgClient.unsafe(`INSERT INTO portal.stripe_events(id,type,commerce_order_id) VALUES
      ('evt_legacy_completed','invoice.payment_succeeded',$1),('evt_legacy_interrupted','invoice.payment_succeeded',NULL)`, [order.id]);
    const migration = readFileSync("db/migrations/20260916-stripe-webhook-completion.sql", "utf8");
    await pgClient.unsafe(migration); await pgClient.unsafe(migration);
    assert.ok((await marker("evt_legacy_completed")).completedAt);
    assert.equal((await marker("evt_legacy_interrupted")).completedAt, null);
    // Simulate the still-running OLD deployment finishing after the migration:
    // it writes an order link, but knows nothing about completed_at.
    await pgClient.unsafe(`INSERT INTO portal.stripe_events(id,type,commerce_order_id,received_at)
      VALUES('evt_legacy_after_migration','invoice.payment_succeeded',$1,'2026-09-01T12:00:00Z')`, [order.id]);
    await pgClient.unsafe(migration);
    assert.equal((await marker("evt_legacy_after_migration")).completedAt, null);
    const beforeLegacyReplay = reads;
    assert.equal((await ok("invoice.payment_succeeded", invoice, "evt_legacy_after_migration")).duplicate, true);
    assert.equal(reads, beforeLegacyReplay, "Post-migration legacy completion must not retrieve or reprocess the payment");
    assert.equal(provisions, 0);
    assert.equal((await current(order.id)).status, "pending", "Compatibility backfill must not invoke settlement");
    assert.equal((await db.select().from(commerceCharges).where(eq(commerceCharges.stripeInvoiceId, invoice.id))).length, 0);
    assert.ok((await marker("evt_legacy_after_migration")).completedAt);
    assert.equal((await marker("evt_legacy_interrupted")).completedAt, null, "Unmatched legacy claims must stay retryable");
    console.log("PASS old writer completing after migration is acknowledged without replaying payment or fulfillment");
    await ok("invoice.payment_succeeded", invoice, "evt_legacy_interrupted");
    assert.ok((await marker("evt_legacy_interrupted")).completedAt);
    assert.equal((await marker("evt_legacy_interrupted")).orderId, order.id,
      "A recovered event commits its order association and completion marker together");
    const readCount = reads;
    assert.equal((await ok("invoice.payment_succeeded", invoice, "evt_legacy_interrupted")).duplicate, true);
    assert.equal(reads, readCount, "Completed duplicates do not call provider or fulfillment");
    await ok("invoice.payment_failed", { ...invoice, status: "open", amount_paid: 0 });
    assert.equal((await db.select().from(commerceCharges).where(eq(commerceCharges.stripeInvoiceId, invoice.id)))[0].status, "paid");
    assert.equal(provisions, 1);
    console.log("PASS legacy migration, interrupted claim recovery, completed replay, stale invoice failure");

    const subId = order.stripeSubscriptionId!;
    const newerFailure = makeInvoice(order, false, 1792080000);
    subscriptions.set(subId, { ...subscriptions.get(subId)!, status: "past_due" });
    await ok("invoice.payment_failed", newerFailure);
    await ok("invoice.payment_succeeded", invoice);
    assert.equal((await current(order.id)).status, "past_due", "Old paid cycle must not restore a currently past-due subscription");
    subscriptions.set(subId, { ...subscriptions.get(subId)!, status: "canceled", cancel_at_period_end: true });
    await ok("customer.subscription.deleted", subscriptions.get(subId));
    await ok("customer.subscription.updated", { ...subscriptions.get(subId), status: "active", cancel_at_period_end: false });
    await ok("invoice.payment_succeeded", invoice);
    assert.equal((await current(order.id)).status, "canceled");
    assert.equal(provisions, 1); assert.equal(suspensions, 1, "Late events must not reactivate or repeatedly suspend a mailbox");
    subscriptions.set(subId, { ...subscriptions.get(subId)!, status: "active", cancel_at_period_end: true });
    await ok("customer.subscription.updated", subscriptions.get(subId));
    assert.equal((await current(order.id)).status, "canceling");
    assert.equal(provisions, 2, "A currently paid-through scheduled cancellation keeps service");
    console.log("PASS older billing cycle and stale subscription events follow current provider state; mailbox lifecycle is stable");

    const outageId = `evt_mock_${randomUUID()}`;
    outage = true;
    assert.equal((await send("invoice.payment_succeeded", invoice, outageId)).status, 500);
    assert.ok(!(await marker(outageId))?.completedAt);
    outage = false; await ok("invoice.payment_succeeded", invoice, outageId);
    const foreignReads = reads;
    assert.equal((await ok("customer.subscription.updated", { id: subId, metadata: { app: "other-app" } })).ignored, true);
    assert.equal(reads, foreignReads);
    const ownedSnapshot = { ...subscriptions.get(subId)! };
    subscriptions.set(subId, { ...ownedSnapshot, metadata: { app: "other-app" } });
    await ok("customer.subscription.updated", ownedSnapshot);
    assert.equal((await current(order.id)).status, "canceling");
    subscriptions.set(subId, ownedSnapshot);
    console.log("PASS provider outage retries without stale fallback; foreign app metadata is rejected before and after retrieval");

    const busyId = `evt_mock_${randomUUID()}`;
    await pgClient.begin(async tx => {
      await tx.unsafe("SELECT pg_advisory_xact_lock(hashtextextended($1,31005))", [`resource:order:${order.id}`]);
      assert.equal((await send("invoice.payment_succeeded", invoice, busyId)).status, 503);
      assert.ok(!(await marker(busyId))?.completedAt);
    });
    await ok("invoice.payment_succeeded", invoice, busyId);
    const disconnected = await makeOrder("libor"); const disconnectedInvoice = makeInvoice(disconnected);
    const disconnectedId = `evt_mock_${randomUUID()}`;
    pauseInvoiceId = disconnectedInvoice.id;
    const providerWaiting = new Promise<void>(resolve => { providerStarted = resolve; });
    let releaseProvider = () => {};
    resumeProvider = new Promise<void>(resolve => { releaseProvider = resolve; });
    const duringDisconnect = send("invoice.payment_succeeded", disconnectedInvoice, disconnectedId);
    await providerWaiting;
    const [backend] = await admin.unsafe(`SELECT pid FROM pg_stat_activity
      WHERE datname=$1 AND application_name='homix-stripe-webhook-mutex' AND state='idle in transaction'`, [databaseName]);
    assert.ok(backend?.pid, "Expected our disposable database's mutex connection");
    await admin.unsafe("SELECT pg_terminate_backend($1)", [backend.pid]);
    releaseProvider(); pauseInvoiceId = null;
    assert.ok([500, 503].includes((await duringDisconnect).status));
    assert.equal((await current(disconnected.id)).status, "pending");
    assert.equal((await db.select().from(commerceCharges).where(eq(commerceCharges.stripeInvoiceId, disconnectedInvoice.id))).length, 0);
    assert.ok(!(await marker(disconnectedId))?.completedAt);
    await ok("invoice.payment_succeeded", disconnectedInvoice, disconnectedId);
    console.log("PASS killing only the mutex connection leaves Node alive and stops effects after the in-flight provider read");
    const parallel = await Promise.all(Array.from({ length: 8 }, async () => {
      const independent = await makeOrder("libor"); return makeInvoice(independent);
    }));
    await Promise.all(parallel.map(i => ok("invoice.payment_succeeded", i)));
    console.log("PASS cross-worker mutex responds retryably; eight independent events complete without exhausting the application pool");

    const rewardOrder = await makeOrder("elite_desk_fee");
    const newer = makeInvoice(rewardOrder, true, 1792080000);
    const older = makeInvoice(rewardOrder, true, 1789401600);
    await ok("invoice.payment_succeeded", newer);
    const latestPaid = (await db.select().from(agents).where(eq(agents.id, agent.id)))[0].affiliationPaidAt;
    await ok("invoice.payment_succeeded", older);
    await ok("invoice.payment_failed", { ...older, status: "open" });
    assert.equal((await db.select().from(agents).where(eq(agents.id, agent.id)))[0].affiliationPaidAt, latestPaid);
    assert.equal((await db.select().from(sponsorPlanRewards).where(eq(sponsorPlanRewards.orderId, rewardOrder.id))).length, 2);
    console.log("PASS late real income retains one reward per invoice without rolling the affiliation payment date backward");

    const checkoutOrder = await makeOrder("listing_email_blast");
    const checkout = { id: `cs_mock_${randomUUID()}`, object: "checkout.session", mode: "payment", status: "complete",
      payment_status: "paid", amount_total: 2200, currency: "usd", created: 1789401600,
      metadata: { app: "homixliving", orderId: String(checkoutOrder.id) }, subscription: null, customer: null,
      payment_intent: { id: "pi_mock_delayed", latest_charge: { id: "ch_mock_delayed", paid: true, created: 1789488000 } },
    } as unknown as Stripe.Checkout.Session;
    sessions.set(checkout.id, checkout);
    await pgClient.begin(async tx => {
      await tx.unsafe("SELECT pg_advisory_xact_lock(hashtextextended($1,31005))", [`resource:order:${checkoutOrder.id}`]);
      assert.equal((await send("checkout.session.completed", { ...checkout, subscription: null })).status, 503,
        "Checkout without a snapshot subscription uses the same local-order mutex as subscription events");
    });
    await ok("checkout.session.expired", { ...checkout, status: "expired", payment_status: "unpaid" });
    assert.equal((await current(checkoutOrder.id)).status, "paid");
    assert.equal((await current(checkoutOrder.id)).amountCents, 2200);
    assert.equal(Date.parse((await current(checkoutOrder.id)).paidAt!), 1789488000 * 1000,
      "An asynchronous payment uses the provider charge date, not Checkout creation or retry arrival");
    console.log("PASS delayed checkout expiry does not erase confirmed one-time/email-campaign payment");

    const crashId = `evt_mock_${randomUUID()}`;
    const child = spawn(process.execPath, ["--import", "./scripts/test-server-only.mjs", "--import", "tsx",
      "./src/lib/__tests__/stripe-webhook-crash-fixture.ts"], {
      env: { ...process.env, STRIPE_TEST_EVENT_ID: crashId, STRIPE_TEST_RESOURCE: `order:${order.id}`, STRIPE_TEST_ORDER_ID: String(order.id) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Crash fixture did not reach committed side effect")), 15000);
        child.stdout.on("data", chunk => { if (String(chunk).includes("SIDE_EFFECT_COMMITTED")) { clearTimeout(timeout); resolve(); } });
        child.once("exit", code => { clearTimeout(timeout); reject(new Error(`Crash fixture exited ${code}`)); });
        child.stderr.on("data", chunk => process.stderr.write(chunk));
      });
      const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
      await ok("invoice.payment_succeeded", invoice, crashId);
      assert.ok((await marker(crashId)).completedAt);
      assert.equal((await current(order.id)).status, "canceling");
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }
    console.log("PASS actual worker SIGKILL after a committed side effect releases its claim and replay reconciles successfully");
  } finally {
    mock.restoreAll();
    await closeStripeEventProcessingConnections(); await closeDatabaseConnections();
    await admin.unsafe(`DROP DATABASE ${databaseName} WITH (FORCE)`); await admin.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
