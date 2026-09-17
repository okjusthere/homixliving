import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  commerceCharges,
  commerceOrders,
  type CommerceOrder,
} from "@/db/schema";
import { assertStripeEventOwnership, StripeEventBusy, withStripeEventProcessing } from "@/lib/commerce/stripe-event-processing";
import { settledCheckoutAmountCents } from "@/lib/commerce/settlement";
import { getStripe, getStripeWebhookSecret, stripeId } from "@/lib/stripe";
import { provisionWorkspaceForOrder, suspendWorkspaceForOrder } from "@/lib/google-workspace";
import { settlePlanPayment } from "@/lib/plan-payments";
import { finalizeAutomaticOnboardingActivation } from "@/lib/onboarding-activation";
import { syncAgentStripeCustomer } from "@/lib/commerce/stripe-customer";
import {
  confirmOnboardingCheckoutExpired, isOnboardingStripeOrder, recordUnpaidOnboardingCheckout,
  settleOnboardingStripePayment, withOnboardingStripeOrder,
} from "@/lib/onboarding-stripe-guard";
import { adminAgentIds, notify } from "@/lib/notify";
import type { DbTransaction } from "@/lib/advisory-locks";
import {
  invoiceSubscriptionMetadata,
  shouldHandleStripeScope,
  stripeMetadataScope,
} from "@/lib/commerce/stripe-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const source = invoice as unknown as {
    subscription?: unknown;
    parent?: { subscription_details?: { subscription?: unknown } | null } | null;
  };
  return (
    stripeId(source.subscription) ||
    stripeId(source.parent?.subscription_details?.subscription)
  );
}

async function findOrderById(orderId: number): Promise<CommerceOrder | null> {
  const [order] = await db
    .select()
    .from(commerceOrders)
    .where(eq(commerceOrders.id, orderId))
    .limit(1);
  return order ?? null;
}

async function findOrderBySession(sessionId: string): Promise<CommerceOrder | null> {
  const [order] = await db
    .select()
    .from(commerceOrders)
    .where(eq(commerceOrders.stripeCheckoutSessionId, sessionId))
    .limit(1);
  return order ?? null;
}

async function findOrderBySubscription(subscriptionId: string): Promise<CommerceOrder | null> {
  const [order] = await db
    .select()
    .from(commerceOrders)
    .where(eq(commerceOrders.stripeSubscriptionId, subscriptionId))
    .limit(1);
  return order ?? null;
}

/**
 * Reject traffic owned by another app before claiming or mutating local state.
 * Objects created before app metadata was introduced remain supported only
 * when they can be tied to a local order.
 */
async function isHomixStripeEvent(event: Stripe.Event): Promise<boolean> {
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    const scope = stripeMetadataScope(session.metadata);
    if (scope !== "legacy") return shouldHandleStripeScope(scope, false);
    // A numeric orderId alone is not a sufficient legacy ownership signal in a
    // shared Stripe account: another app could use the same local integer.
    return shouldHandleStripeScope(
      scope,
      Boolean(await findOrderBySession(session.id)),
    );
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const scope = stripeMetadataScope(subscription.metadata);
    if (scope !== "legacy") return shouldHandleStripeScope(scope, false);
    return shouldHandleStripeScope(
      scope,
      Boolean(await findOrderBySubscription(subscription.id)),
    );
  }

  if (event.type === "invoice.payment_succeeded" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const scope = stripeMetadataScope(invoiceSubscriptionMetadata(invoice));
    if (scope !== "legacy") return shouldHandleStripeScope(scope, false);
    const subscriptionId = invoiceSubscriptionId(invoice);
    return shouldHandleStripeScope(
      scope,
      Boolean(subscriptionId && await findOrderBySubscription(subscriptionId)),
    );
  }

  return false;
}

async function maybeProvisionWorkspace(order: CommerceOrder) {
  if (order.productKey !== "company_domain_email") return;
  await assertStripeEventOwnership();
  await provisionWorkspaceForOrder(order);
}

async function maybeSuspendWorkspace(order: CommerceOrder) {
  if (order.productKey !== "company_domain_email") return;
  await assertStripeEventOwnership();
  await suspendWorkspaceForOrder(order);
}

async function flagOnboardingReconciliation(order: CommerceOrder, sourceKey: string) {
  await assertStripeEventOwnership();
  // The financial/audit flag is committed already. Only an in-app alert, never an automatic refund.
  await notify({ recipientAgentIds: await adminAgentIds(), type: "onboarding_payment_reconciliation",
    title: "Stripe 入职付款需对账 / Onboarding payment needs reconciliation",
    body: `Actual Stripe payment on order #${order.id} was retained without changing the approved onboarding basis or awarding another sponsor reward. Review before collecting or refunding.`,
    href: `/admin/finance?q=${encodeURIComponent(order.customerEmail || order.customerName || "")}`, dedupeKey: `onboarding-stripe-reconciliation:${sourceKey}`,
  }).catch((error) => console.error("Onboarding reconciliation notification failed", error));
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventId: string,
  subscription: Stripe.Subscription | null,
  eventCreated: number,
): Promise<number | null> {
  const metadataOrderId = session.metadata?.orderId ? Number(session.metadata.orderId) : NaN;
  const sessionOrder = await findOrderBySession(session.id);
  const order = sessionOrder || (
    Number.isInteger(metadataOrderId) && metadataOrderId > 0
      ? await findOrderById(metadataOrderId)
      : null
  );

  if (!order) return null;
  await assertStripeEventOwnership();

  const isPaid =
    session.payment_status === "paid" || session.payment_status === "no_payment_required";
  const nextStatus = subscription ? subscriptionOrderStatus(subscription) : isPaid
    ? session.mode === "subscription"
      ? "active"
      : "paid"
    : "open";
  const now = new Date().toISOString();
  const invoice = typeof session.invoice === "object" ? session.invoice : null;
  const intent = typeof session.payment_intent === "object" ? session.payment_intent : null;
  const charge = typeof intent?.latest_charge === "object" ? intent.latest_charge : null;
  // Session.created is checkout creation, potentially days before an async
  // payment succeeds. Prefer provider settlement facts, then a stable event
  // timestamp/previous payment, never the current retry's arrival date.
  const earnedAt = epochToIso(invoice?.status_transitions?.paid_at)
    || (charge?.paid ? epochToIso(charge.created) : null)
    || order.paidAt || epochToIso(eventCreated) || now;
  const paidAt = order.paidAt && Date.parse(order.paidAt) > Date.parse(earnedAt) ? order.paidAt : earnedAt;
  const amountCents = isPaid
    ? settledCheckoutAmountCents(session.amount_total, order.amountCents)
    : order.amountCents;
  const updatedOrder = {
    ...order,
    status: nextStatus,
    amountCents,
    currency: session.currency || order.currency,
    stripeCheckoutSessionId: session.id,
    stripeCustomerId: stripeId(session.customer),
    stripeSubscriptionId: stripeId(session.subscription),
    stripePaymentIntentId: stripeId(session.payment_intent),
    paidAt: isPaid ? paidAt : order.paidAt,
    updatedAt: now,
  };

  if (isOnboardingStripeOrder(order)) {
    if (!isPaid) {
      await recordUnpaidOnboardingCheckout(order, session);
    } else {
      const sourceKey = `checkout:${session.id}`;
      const result = await settleOnboardingStripePayment(order, { sourceKey, eventId,
        // A catalog quote is not evidence of money received. Missing provider facts retry safely.
        amountCents: session.amount_total ?? Number.NaN, currency: session.currency || "", earnedAt,
        kind: "checkout", patch: { status: nextStatus, stripeCheckoutSessionId: session.id,
          stripeCustomerId: stripeId(session.customer), stripeSubscriptionId: stripeId(session.subscription),
          stripePaymentIntentId: stripeId(session.payment_intent) }, session });
      if (result.reconciliationRequired) await flagOnboardingReconciliation(result.order, sourceKey);
      else await finalizeAutomaticOnboardingActivation({ agentId: order.agentId!, orderId: order.id });
    }
  } else await db
    .update(commerceOrders)
    .set({
      status: updatedOrder.status,
      amountCents: updatedOrder.amountCents,
      currency: updatedOrder.currency,
      stripeCheckoutSessionId: updatedOrder.stripeCheckoutSessionId,
      stripeCustomerId: updatedOrder.stripeCustomerId,
      stripeSubscriptionId: updatedOrder.stripeSubscriptionId,
      stripePaymentIntentId: updatedOrder.stripePaymentIntentId,
      paidAt: updatedOrder.paidAt,
      updatedAt: updatedOrder.updatedAt,
    })
    .where(eq(commerceOrders.id, order.id));

  const checkoutCustomerId = stripeId(session.customer);
  if (order.agentId && checkoutCustomerId) {
    await assertStripeEventOwnership();
    try {
      const syncResult = await syncAgentStripeCustomer({
        agentId: order.agentId,
        customerId: checkoutCustomerId,
      });
      if (syncResult.status === "conflict") {
        console.warn("Stripe Customer mismatch during checkout reconciliation", {
          eventId,
          eventCustomerId: checkoutCustomerId,
          storedCustomerId: syncResult.customerId,
          agentId: order.agentId,
          orderId: order.id,
          checkoutSessionId: session.id,
        });
      }
    } catch (error) {
      // Billing identity repair must not block fulfillment of a verified paid
      // Checkout Session. The mismatch remains visible for manual review.
      console.error("Stripe Customer synchronization failed", {
        eventId,
        agentId: order.agentId,
        orderId: order.id,
        checkoutSessionId: session.id,
        error,
      });
    }
  }

  if (isOnboardingStripeOrder(order)) return order.id;

  if (isPaid) {
    // Checkout owns the initial payment for both one-time and subscription
    // products. Stripe does not guarantee delivery order between
    // checkout.session.completed and the subscription's first invoice event.
    await assertStripeEventOwnership();
    const settlement = await settlePlanPayment(db, {
      order: updatedOrder,
      sourceKey: `checkout:${session.id}`,
      amountCents,
      rewardEligibleAmountCents: order.licenseTransferFeeCents > 0
        ? Math.max(0, order.amountCents - order.licenseTransferFeeCents)
        : amountCents,
      earnedAt,
    });
    if (
      settlement &&
      order.paymentChannel === "stripe" &&
      order.licenseTransferFeeCents > 0
    ) {
      await finalizeAutomaticOnboardingActivation({
        agentId: settlement.agentId,
        orderId: order.id,
      });
    }
    if (!subscription) await maybeProvisionWorkspace(updatedOrder);
  }

  return order.id;
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<number | null> {
  const sessionOrder = await findOrderBySession(session.id);
  const metadataOrderId = session.metadata?.orderId ? Number(session.metadata.orderId) : NaN;
  const order = sessionOrder || (
    Number.isInteger(metadataOrderId) && metadataOrderId > 0
      ? await findOrderById(metadataOrderId)
      : null
  );
  if (!order) return null;
  await assertStripeEventOwnership();

  if (isOnboardingStripeOrder(order)) {
    await confirmOnboardingCheckoutExpired(order, session);
    return order.id;
  }

  await db
    .update(commerceOrders)
    .set({ status: "expired", updatedAt: new Date().toISOString() })
    .where(and(eq(commerceOrders.id, order.id), isNull(commerceOrders.paidAt)));
  return order.id;
}

function epochToIso(v: unknown): string | null {
  return typeof v === "number" && v > 0 ? new Date(v * 1000).toISOString() : null;
}

/**
 * One ledger row per Stripe invoice, idempotent on stripe_invoice_id (webhook
 * retries and the admin backfill can both write it safely). Recorded even
 * when no local order matches — reconciliation must never drop money.
 */
async function recordInvoiceCharge(
  invoice: Stripe.Invoice,
  status: "paid" | "failed",
  order: CommerceOrder | null,
  executor: typeof db | DbTransaction = db,
) {
  if (!invoice.id) return false;
  await assertStripeEventOwnership();
  const transitions = invoice.status_transitions as { paid_at?: number | null } | null;
  const values = {
    orderId: order?.id ?? null,
    stripeInvoiceId: invoice.id,
    stripeSubscriptionId: invoiceSubscriptionId(invoice),
    stripeCustomerId: stripeId(invoice.customer),
    amountCents: status === "paid" ? invoice.amount_paid : invoice.amount_due,
    currency: invoice.currency || "usd",
    status,
    productName: order?.productName ?? invoice.lines?.data?.[0]?.description ?? null,
    customerEmail: invoice.customer_email ?? order?.customerEmail ?? null,
    customerName: invoice.customer_name ?? order?.customerName ?? null,
    periodStart: epochToIso(invoice.period_start),
    periodEnd: epochToIso(invoice.period_end),
    paidAt: status === "paid" ? epochToIso(transitions?.paid_at) ?? new Date().toISOString() : null,
  };
  const [written] = await executor
    .insert(commerceCharges)
    .values(values)
    .onConflictDoUpdate({
      target: commerceCharges.stripeInvoiceId,
      set: {
        status: values.status,
        amountCents: values.amountCents,
        paidAt: values.paidAt,
        orderId: values.orderId,
      },
      // ON CONFLICT holds the invoice row lock, including concurrent first insertions.
      // A delayed failure cannot replace an actual paid amount/timestamp.
      setWhere: status === "failed" ? and(ne(commerceCharges.status, "paid"), isNull(commerceCharges.paidAt)) : undefined,
    }).returning({ id: commerceCharges.id });
  return Boolean(written);
}

async function handleInvoicePaid(invoice: Stripe.Invoice, eventId: string, subscription: Stripe.Subscription | null): Promise<number | null> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  const order = subscriptionId ? await findOrderBySubscription(subscriptionId) : null;
  await recordInvoiceCharge(invoice, "paid", order);
  if (!order) return null;
  await assertStripeEventOwnership();

  const now = epochToIso(invoice.status_transitions?.paid_at) || order.paidAt || new Date().toISOString();
  const status = subscription ? subscriptionOrderStatus(subscription) : "active";
  const paidAt = order.paidAt && Date.parse(order.paidAt) > Date.parse(now) ? order.paidAt : now;
  const updatedAt = new Date().toISOString();
  if (isOnboardingStripeOrder(order)) {
    const sourceKey = `invoice:${invoice.id}`;
    const periods = invoice.lines.data.map(line => line.period.start).filter(start => Number.isFinite(start) && start > 0);
    const result = await settleOnboardingStripePayment(order, { sourceKey, eventId,
      amountCents: invoice.amount_paid, currency: invoice.currency, earnedAt: now,
      kind: invoice.billing_reason === "subscription_create" ? "initial_invoice" : "renewal",
      renewalCycleStart: invoice.billing_reason === "subscription_cycle" && periods.length
        ? new Date(Math.min(...periods) * 1000).toISOString() : null,
      patch: { status } });
    if (result.reconciliationRequired) await flagOnboardingReconciliation(result.order, sourceKey);
    return order.id;
  }
  const updatedOrder = {
    ...order,
    status,
    paidAt,
    updatedAt,
  };

  await db
    .update(commerceOrders)
    .set({ status, paidAt, updatedAt })
    .where(eq(commerceOrders.id, order.id));

  // The initial subscription payment is handled by checkout.session.completed.
  // Subsequent invoices are renewals and create their own sponsor reward.
  if (invoice.billing_reason !== "subscription_create") {
    await settlePlanPayment(db, {
      order: updatedOrder,
      sourceKey: `invoice:${invoice.id}`,
      amountCents: invoice.amount_paid,
      earnedAt: now,
    });
  }
  return order.id;
}

async function handleInvoiceFailed(invoice: Stripe.Invoice, subscription: Stripe.Subscription | null): Promise<number | null> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  const order = subscriptionId ? await findOrderBySubscription(subscriptionId) : null;
  const status = subscription ? subscriptionOrderStatus(subscription) : "past_due";
  if (!order) {
    await recordInvoiceCharge(invoice, "failed", null);
    return null;
  }

  if (isOnboardingStripeOrder(order)) {
    await withOnboardingStripeOrder(order, async (tx, _agent, current) => {
      // Keep the invoice row locked until its corresponding order update commits.
      if (!await recordInvoiceCharge(invoice, "failed", current, tx)) return;
      // A failed first invoice is unresolved, not proof the Checkout expired.
      await tx.update(commerceOrders).set({ status, updatedAt: new Date().toISOString() }).where(eq(commerceOrders.id, current.id));
    });
    return order.id;
  }

  await db.transaction(async (tx) => {
    if (!await recordInvoiceCharge(invoice, "failed", order, tx)) return;
    await tx.update(commerceOrders)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(commerceOrders.id, order.id));
  });
  return order.id;
}

function subscriptionOrderStatus(subscription: Stripe.Subscription): string {
  // Canceled/unpaid subscriptions must not be labeled "canceling" merely
  // because a historical cancellation flag remains on the object.
  if (["active", "trialing"].includes(subscription.status)) {
    return subscription.cancel_at_period_end || subscription.cancel_at ? "canceling" : "active";
  }
  return subscription.status;
}

async function reconcileSubscription(subscription: Stripe.Subscription): Promise<number | null> {
  const order = await findOrderBySubscription(subscription.id);
  if (!order) return null;
  await assertStripeEventOwnership();
  const status = subscriptionOrderStatus(subscription);
  const updatedAt = new Date().toISOString();
  if (isOnboardingStripeOrder(order)) {
    await withOnboardingStripeOrder(order, async (tx, _agent, current) => {
      await tx.update(commerceOrders).set({ status, updatedAt }).where(eq(commerceOrders.id, current.id));
    });
  } else {
    await db.update(commerceOrders).set({ status, updatedAt }).where(eq(commerceOrders.id, order.id));
    const current = { ...order, status, updatedAt };
    // Paid-through scheduled cancellations retain their mailbox. Past due
    // preserves the existing grace policy; actual cancellation suspends it.
    if (status === "active" || status === "canceling") await maybeProvisionWorkspace(current);
    else if (status === "canceled" && current.workspaceStatus !== "suspended") await maybeSuspendWorkspace(current);
  }
  return order.id;
}

async function eventResourceKey(event: Stripe.Event): Promise<string> {
  let localOrder: CommerceOrder | null = null;
  let metadata: Stripe.Metadata | null | undefined;
  let fallback: string;
  if (event.type.startsWith("customer.subscription.")) {
    const subscription = event.data.object as Stripe.Subscription;
    localOrder = await findOrderBySubscription(subscription.id);
    metadata = subscription.metadata;
    fallback = subscription.id;
  } else if (event.type.startsWith("invoice.")) {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = invoiceSubscriptionId(invoice);
    localOrder = subscriptionId ? await findOrderBySubscription(subscriptionId) : null;
    metadata = invoiceSubscriptionMetadata(invoice);
    fallback = subscriptionId || invoice.id;
  } else {
    const session = event.data.object as Stripe.Checkout.Session;
    localOrder = await findOrderBySession(session.id);
    metadata = session.metadata;
    fallback = stripeId(session.subscription) || session.id;
  }
  const metadataOrderId = Number(metadata?.orderId);
  if (!localOrder && stripeMetadataScope(metadata) === "owned" && Number.isInteger(metadataOrderId) && metadataOrderId > 0) {
    localOrder = await findOrderById(metadataOrderId);
  }
  // A Checkout event may predate attaching its subscription ID. Its local
  // order ID still serializes it with later invoice/subscription deliveries.
  return localOrder ? `order:${localOrder.id}` : fallback;
}

const stripeReadOptions = { timeout: 5000, maxNetworkRetries: 0 };

async function processStripeEvent(event: Stripe.Event, resourceKey: string): Promise<number | null> {
  // Event delivery order (and event.created) is not object version order.
  // Always retrieve the current provider object INSIDE the resource mutex.
  // Failures leave completion unset and cause Stripe to retry, never apply
  // the stale snapshot as a fallback during a provider outage.
  const stripe = getStripe();
  const verifyOwnership = async (object: Stripe.Event.Data.Object) => {
    await assertStripeEventOwnership();
    const currentEvent = { ...event, data: { ...event.data, object } } as Stripe.Event;
    if (!await isHomixStripeEvent(currentEvent)) return false;
    if (await eventResourceKey(currentEvent) !== resourceKey) {
      throw new StripeEventBusy("Stripe order association changed while waiting; retry with its current resource lock.");
    }
    return true;
  };
  let subscription: Stripe.Subscription | null = null;
  let orderId: number | null = null;
  if (event.type.startsWith("customer.subscription.")) {
    subscription = await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id, {}, stripeReadOptions);
    if (!await verifyOwnership(subscription)) return null;
  } else if (event.type.startsWith("invoice.")) {
    const invoice = await stripe.invoices.retrieve((event.data.object as Stripe.Invoice).id, {}, stripeReadOptions);
    if (!await verifyOwnership(invoice)) return null;
    const subscriptionId = invoiceSubscriptionId(invoice);
    if (subscriptionId) subscription = await stripe.subscriptions.retrieve(subscriptionId, {}, stripeReadOptions);
    await assertStripeEventOwnership();
    if (subscription && stripeMetadataScope(subscription.metadata) === "foreign") return null;
    orderId = invoice.status === "paid"
      ? await handleInvoicePaid(invoice, event.id, subscription)
      : await handleInvoiceFailed(invoice, subscription);
  } else {
    const session = await stripe.checkout.sessions.retrieve((event.data.object as Stripe.Checkout.Session).id,
      { expand: ["invoice", "payment_intent.latest_charge"] }, stripeReadOptions);
    if (!await verifyOwnership(session)) return null;
    const subscriptionId = stripeId(session.subscription);
    if (subscriptionId) subscription = await stripe.subscriptions.retrieve(subscriptionId, {}, stripeReadOptions);
    await assertStripeEventOwnership();
    if (subscription && stripeMetadataScope(subscription.metadata) === "foreign") return null;
    if (session.status === "expired") orderId = await handleCheckoutExpired(session);
    else if (session.status === "complete") orderId = await handleCheckoutCompleted(session, event.id, subscription, event.created);
    else throw new Error("Stripe checkout completion/expiry is not yet confirmed; retry delivery.");
  }
  if (subscription) orderId = await reconcileSubscription(subscription) ?? orderId;
  return orderId;
}

export async function POST(request: Request) {
  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 503 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      await request.text(),
      signature,
      webhookSecret
    );
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error);
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    if (!(await isHomixStripeEvent(event))) {
      return NextResponse.json({ received: true, ignored: true });
    }
    const resourceKey = await eventResourceKey(event);
    const result = await withStripeEventProcessing(event, resourceKey, () => processStripeEvent(event, resourceKey));
    return NextResponse.json({ received: true, ...(result === "duplicate" ? { duplicate: true } : {}) });
  } catch (error) {
    console.error("Stripe webhook processing failed", { eventId: event.id, error });
    return NextResponse.json({ error: "Webhook processing failed; retry delivery." }, {
      status: error instanceof StripeEventBusy ? 503 : 500,
      headers: { "Retry-After": "5" },
    });
  }
}
