import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  commerceCharges,
  commerceOrders,
  stripeEvents,
  type CommerceOrder,
} from "@/db/schema";
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
  await provisionWorkspaceForOrder(order);
}

async function maybeSuspendWorkspace(order: CommerceOrder) {
  if (order.productKey !== "company_domain_email") return;
  await suspendWorkspaceForOrder(order);
}

async function flagOnboardingReconciliation(order: CommerceOrder, sourceKey: string) {
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
): Promise<number | null> {
  const metadataOrderId = session.metadata?.orderId ? Number(session.metadata.orderId) : NaN;
  const sessionOrder = await findOrderBySession(session.id);
  const order = sessionOrder || (
    Number.isInteger(metadataOrderId) && metadataOrderId > 0
      ? await findOrderById(metadataOrderId)
      : null
  );

  if (!order) return null;

  const isPaid =
    session.payment_status === "paid" || session.payment_status === "no_payment_required";
  const nextStatus = isPaid
    ? session.mode === "subscription"
      ? "active"
      : "paid"
    : "open";
  const now = new Date().toISOString();
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
    paidAt: isPaid ? now : order.paidAt,
    updatedAt: now,
  };

  if (isOnboardingStripeOrder(order)) {
    if (!isPaid) {
      await recordUnpaidOnboardingCheckout(order, session);
    } else {
      const sourceKey = `checkout:${session.id}`;
      const result = await settleOnboardingStripePayment(order, { sourceKey, eventId,
        // A catalog quote is not evidence of money received. Missing provider facts retry safely.
        amountCents: session.amount_total ?? Number.NaN, currency: session.currency || "", earnedAt: now,
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
    const settlement = await settlePlanPayment(db, {
      order: updatedOrder,
      sourceKey: `checkout:${session.id}`,
      amountCents,
      rewardEligibleAmountCents: order.licenseTransferFeeCents > 0
        ? Math.max(0, order.amountCents - order.licenseTransferFeeCents)
        : amountCents,
      earnedAt: now,
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
    await maybeProvisionWorkspace(updatedOrder);
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

  if (isOnboardingStripeOrder(order)) {
    await confirmOnboardingCheckoutExpired(order, session);
    return order.id;
  }

  await db
    .update(commerceOrders)
    .set({ status: "expired", updatedAt: new Date().toISOString() })
    .where(eq(commerceOrders.id, order.id));
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

async function handleInvoicePaid(invoice: Stripe.Invoice, eventId: string): Promise<number | null> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  const order = subscriptionId ? await findOrderBySubscription(subscriptionId) : null;
  await recordInvoiceCharge(invoice, "paid", order);
  if (!order) return null;

  const now = new Date().toISOString();
  if (isOnboardingStripeOrder(order)) {
    const sourceKey = `invoice:${invoice.id}`;
    const periods = invoice.lines.data.map(line => line.period.start).filter(start => Number.isFinite(start) && start > 0);
    const result = await settleOnboardingStripePayment(order, { sourceKey, eventId,
      amountCents: invoice.amount_paid, currency: invoice.currency, earnedAt: now,
      kind: invoice.billing_reason === "subscription_create" ? "initial_invoice" : "renewal",
      renewalCycleStart: invoice.billing_reason === "subscription_cycle" && periods.length
        ? new Date(Math.min(...periods) * 1000).toISOString() : null,
      patch: { status: "active" } });
    if (result.reconciliationRequired) await flagOnboardingReconciliation(result.order, sourceKey);
    return order.id;
  }
  const updatedOrder = {
    ...order,
    status: "active",
    paidAt: now,
    updatedAt: now,
  };

  await db
    .update(commerceOrders)
    .set({ status: "active", paidAt: now, updatedAt: now })
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
  await maybeProvisionWorkspace(updatedOrder);
  return order.id;
}

async function handleInvoiceFailed(invoice: Stripe.Invoice): Promise<number | null> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  const order = subscriptionId ? await findOrderBySubscription(subscriptionId) : null;
  if (!order) {
    await recordInvoiceCharge(invoice, "failed", null);
    return null;
  }

  if (isOnboardingStripeOrder(order)) {
    await withOnboardingStripeOrder(order, async (tx, _agent, current) => {
      // Keep the invoice row locked until its corresponding order update commits.
      if (!await recordInvoiceCharge(invoice, "failed", current, tx)) return;
      // A failed first invoice is unresolved, not proof the Checkout expired.
      await tx.update(commerceOrders).set({ status: "past_due", updatedAt: new Date().toISOString() }).where(eq(commerceOrders.id, current.id));
    });
    return order.id;
  }

  await db.transaction(async (tx) => {
    if (!await recordInvoiceCharge(invoice, "failed", order, tx)) return;
    await tx.update(commerceOrders)
      .set({ status: "past_due", updatedAt: new Date().toISOString() })
      .where(eq(commerceOrders.id, order.id));
  });
  return order.id;
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<number | null> {
  const order = await findOrderBySubscription(subscription.id);
  if (!order) return null;

  const isPendingCancellation = Boolean(subscription.cancel_at_period_end || subscription.cancel_at);
  const now = new Date().toISOString();
  const status = isPendingCancellation
    ? "canceling"
    : subscription.status === "active" || subscription.status === "trialing"
    ? "active"
    : subscription.status;
  const updatedOrder = {
    ...order,
    status,
    updatedAt: now,
  };

  if (isOnboardingStripeOrder(order)) {
    await withOnboardingStripeOrder(order, async (tx, _agent, current) => {
      await tx.update(commerceOrders).set({ status, updatedAt: now }).where(eq(commerceOrders.id, current.id));
    });
    return order.id;
  }

  await db
    .update(commerceOrders)
    .set({ status, updatedAt: now })
    .where(eq(commerceOrders.id, order.id));

  // Do NOT suspend on a *scheduled* cancellation: the customer has paid through
  // the current period and keeps their mailbox until the subscription actually
  // ends (customer.subscription.deleted, handled separately). Suspending here
  // would cut off email the instant they click "cancel".
  if (!isPendingCancellation && status === "active") {
    await maybeProvisionWorkspace(updatedOrder);
  }

  return order.id;
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<number | null> {
  const order = await findOrderBySubscription(subscription.id);
  if (!order) return null;

  if (isOnboardingStripeOrder(order)) {
    await withOnboardingStripeOrder(order, async (tx, _agent, current) => {
      await tx.update(commerceOrders).set({ status: "canceled", updatedAt: new Date().toISOString() }).where(eq(commerceOrders.id, current.id));
    });
    return order.id;
  }

  await db
    .update(commerceOrders)
    .set({ status: "canceled", updatedAt: new Date().toISOString() })
    .where(eq(commerceOrders.id, order.id));
  await maybeSuspendWorkspace(order);
  return order.id;
}

async function processStripeEvent(event: Stripe.Event): Promise<number | null> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session,
        event.id,
      );
    case "checkout.session.expired":
      return handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
    case "invoice.payment_succeeded":
      return handleInvoicePaid(event.data.object as Stripe.Invoice, event.id);
    case "invoice.payment_failed":
      return handleInvoiceFailed(event.data.object as Stripe.Invoice);
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
    default:
      return null;
  }
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

  if (!(await isHomixStripeEvent(event))) {
    console.info("Ignoring Stripe event outside Homix scope", {
      eventId: event.id,
      eventType: event.type,
    });
    return NextResponse.json({ received: true, ignored: true });
  }

  // Claim the event atomically BEFORE processing. Stripe delivers at-least-once
  // and can fan two deliveries of the same event.id in concurrently; a
  // select-then-process-then-insert let both pass the check and run the handler
  // twice (double provisioning, duplicate side effects). Insert-first with
  // onConflictDoNothing means exactly one delivery wins the claim.
  const claimed = await db
    .insert(stripeEvents)
    .values({
      id: event.id,
      type: event.type,
      orderId: null,
      receivedAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id });

  if (claimed.length === 0) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const orderId = await processStripeEvent(event);
    if (orderId !== null) {
      try {
        await db
          .update(stripeEvents)
          .set({ orderId })
          .where(eq(stripeEvents.id, event.id));
      } catch (linkError) {
        // The orderId comes from event metadata and may reference an order from
        // another environment (FK violation). The event is already processed, so
        // don't fail — and retry — the webhook over a cosmetic link.
        console.warn("Could not link Stripe event to order", event.id, linkError);
      }
    }
  } catch (error) {
    // Release the claim so Stripe's retry can reprocess this event; otherwise the
    // claimed-but-unprocessed row would swallow every retry as a "duplicate".
    console.error("Stripe webhook processing failed", error);
    await db.delete(stripeEvents).where(eq(stripeEvents.id, event.id));
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
