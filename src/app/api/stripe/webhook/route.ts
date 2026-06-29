import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { commerceOrders, stripeEvents, type CommerceOrder } from "@/db/schema";
import { getStripe, getStripeWebhookSecret, stripeId } from "@/lib/stripe";
import { provisionWorkspaceForOrder, suspendWorkspaceForOrder } from "@/lib/google-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function eventOrderId(event: Stripe.Event): number | null {
  const data = event.data.object as { metadata?: Record<string, string> | null };
  const raw = data.metadata?.orderId;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

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

async function maybeProvisionWorkspace(order: CommerceOrder) {
  if (order.productKey !== "company_domain_email") return;
  await provisionWorkspaceForOrder(order);
}

async function maybeSuspendWorkspace(order: CommerceOrder) {
  if (order.productKey !== "company_domain_email") return;
  await suspendWorkspaceForOrder(order);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<number | null> {
  const metadataOrderId = session.metadata?.orderId ? Number(session.metadata.orderId) : NaN;
  const order =
    Number.isInteger(metadataOrderId) && metadataOrderId > 0
      ? await findOrderById(metadataOrderId)
      : await findOrderBySession(session.id);

  if (!order) return null;

  const isPaid =
    session.payment_status === "paid" || session.payment_status === "no_payment_required";
  const nextStatus = isPaid
    ? session.mode === "subscription"
      ? "active"
      : "paid"
    : "open";
  const now = new Date().toISOString();
  const updatedOrder = {
    ...order,
    status: nextStatus,
    stripeCheckoutSessionId: session.id,
    stripeCustomerId: stripeId(session.customer),
    stripeSubscriptionId: stripeId(session.subscription),
    stripePaymentIntentId: stripeId(session.payment_intent),
    paidAt: isPaid ? now : order.paidAt,
    updatedAt: now,
  };

  await db
    .update(commerceOrders)
    .set({
      status: updatedOrder.status,
      stripeCheckoutSessionId: updatedOrder.stripeCheckoutSessionId,
      stripeCustomerId: updatedOrder.stripeCustomerId,
      stripeSubscriptionId: updatedOrder.stripeSubscriptionId,
      stripePaymentIntentId: updatedOrder.stripePaymentIntentId,
      paidAt: updatedOrder.paidAt,
      updatedAt: updatedOrder.updatedAt,
    })
    .where(eq(commerceOrders.id, order.id));

  if (isPaid) {
    await maybeProvisionWorkspace(updatedOrder);
  }

  return order.id;
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<number | null> {
  const order = session.metadata?.orderId
    ? await findOrderById(Number(session.metadata.orderId))
    : await findOrderBySession(session.id);
  if (!order) return null;

  await db
    .update(commerceOrders)
    .set({ status: "expired", updatedAt: new Date().toISOString() })
    .where(eq(commerceOrders.id, order.id));
  return order.id;
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<number | null> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return null;

  const order = await findOrderBySubscription(subscriptionId);
  if (!order) return null;

  const now = new Date().toISOString();
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

  await maybeProvisionWorkspace(updatedOrder);
  return order.id;
}

async function handleInvoiceFailed(invoice: Stripe.Invoice): Promise<number | null> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return null;

  const order = await findOrderBySubscription(subscriptionId);
  if (!order) return null;

  await db
    .update(commerceOrders)
    .set({ status: "past_due", updatedAt: new Date().toISOString() })
    .where(eq(commerceOrders.id, order.id));
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

  await db
    .update(commerceOrders)
    .set({ status, updatedAt: now })
    .where(eq(commerceOrders.id, order.id));

  if (isPendingCancellation) {
    await maybeSuspendWorkspace(updatedOrder);
  } else if (status === "active") {
    await maybeProvisionWorkspace(updatedOrder);
  }

  return order.id;
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<number | null> {
  const order = await findOrderBySubscription(subscription.id);
  if (!order) return null;

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
      return handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    case "checkout.session.expired":
      return handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
    case "invoice.payment_succeeded":
      return handleInvoicePaid(event.data.object as Stripe.Invoice);
    case "invoice.payment_failed":
      return handleInvoiceFailed(event.data.object as Stripe.Invoice);
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
    default:
      return eventOrderId(event);
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

  const [existingEvent] = await db
    .select({ id: stripeEvents.id })
    .from(stripeEvents)
    .where(eq(stripeEvents.id, event.id))
    .limit(1);

  if (existingEvent) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const orderId = await processStripeEvent(event);
    await db.insert(stripeEvents).values({
      id: event.id,
      type: event.type,
      orderId,
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
