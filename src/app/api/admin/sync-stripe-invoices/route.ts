import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import type Stripe from "stripe";
import { auth } from "@/auth";
import { db } from "@/db";
import { commerceCharges, commerceOrders } from "@/db/schema";
import { settledCheckoutAmountCents } from "@/lib/commerce/settlement";
import { getStripe, stripeId } from "@/lib/stripe";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Pulls the full invoice history for every known subscription from Stripe and
// upserts it into commerce_charges — reconciles renewals that happened before
// the invoice-ledger existed, and any webhook deliveries that were missed.
// Idempotent (unique on stripe_invoice_id); safe to re-run any time.
//
// Auth: an admin session OR the CRON_SECRET bearer.
async function isAuthorized(request: Request): Promise<{ ok: boolean; actor: string }> {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") || "";
  if (configuredSecret && authorization === `Bearer ${configuredSecret}`) {
    return { ok: true, actor: "cron-secret" };
  }
  try {
    const session = await auth();
    if (session?.user?.isAdmin) {
      return { ok: true, actor: session.user.email || "admin" };
    }
  } catch {
    // No request scope / no session — fall through to unauthorized.
  }
  return { ok: false, actor: "" };
}

function epochToIso(v: unknown): string | null {
  return typeof v === "number" && v > 0 ? new Date(v * 1000).toISOString() : null;
}

function chargeStatus(invoice: Stripe.Invoice): string {
  if (invoice.status === "paid") return "paid";
  if (invoice.status === "open" && (invoice.attempt_count ?? 0) > 0) return "failed";
  return invoice.status ?? "open";
}

export async function POST(request: Request) {
  const authz = await isAuthorized(request);
  if (!authz.ok) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const [oneTimeOrders, subOrders] = await Promise.all([
    db
      .select()
      .from(commerceOrders)
      .where(
        and(
          eq(commerceOrders.billingMode, "payment"),
          isNotNull(commerceOrders.stripeCheckoutSessionId),
        ),
      ),
    db
      .select()
      .from(commerceOrders)
      .where(isNotNull(commerceOrders.stripeSubscriptionId)),
  ]);

  let checkoutSessionsSeen = 0;
  let ordersReconciled = 0;
  let invoicesSeen = 0;
  let upserted = 0;
  const errors: string[] = [];

  // Checkout Session.amount_total is the amount actually charged after
  // discounts and automatic tax. Backfill it for one-time orders created
  // before the webhook started persisting Stripe's settled total.
  for (const order of oneTimeOrders) {
    const sessionId = order.stripeCheckoutSessionId!;
    try {
      const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
      checkoutSessionsSeen++;
      const isPaid =
        checkoutSession.payment_status === "paid" ||
        checkoutSession.payment_status === "no_payment_required";
      if (!isPaid) continue;

      const amountCents = settledCheckoutAmountCents(
        checkoutSession.amount_total,
        order.amountCents,
      );
      const currency = checkoutSession.currency || order.currency;
      const paidAt = order.paidAt || epochToIso(checkoutSession.created);
      await db
        .update(commerceOrders)
        .set({
          amountCents,
          currency,
          status: "paid",
          paidAt,
          stripeCustomerId: stripeId(checkoutSession.customer) || order.stripeCustomerId,
          stripePaymentIntentId:
            stripeId(checkoutSession.payment_intent) || order.stripePaymentIntentId,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(commerceOrders.id, order.id));
      ordersReconciled++;
    } catch (error) {
      errors.push(`${sessionId}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  for (const order of subOrders) {
    const subscriptionId = order.stripeSubscriptionId!;
    try {
      let startingAfter: string | undefined;
      do {
        const invoices = await stripe.invoices.list({
          subscription: subscriptionId,
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });
        for (const invoice of invoices.data) {
          if (!invoice.id) continue;
          invoicesSeen++;
          const status = chargeStatus(invoice);
          const transitions = invoice.status_transitions as { paid_at?: number | null } | null;
          const values = {
            orderId: order.id,
            stripeInvoiceId: invoice.id,
            stripeSubscriptionId: subscriptionId,
            stripeCustomerId: stripeId(invoice.customer),
            amountCents: status === "paid" ? invoice.amount_paid : invoice.amount_due,
            currency: invoice.currency || "usd",
            status,
            productName: order.productName,
            customerEmail: invoice.customer_email ?? order.customerEmail,
            customerName: invoice.customer_name ?? order.customerName,
            periodStart: epochToIso(invoice.period_start),
            periodEnd: epochToIso(invoice.period_end),
            paidAt: status === "paid" ? epochToIso(transitions?.paid_at) : null,
          };
          await db
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
            });
          upserted++;
        }
        startingAfter = invoices.has_more ? invoices.data.at(-1)?.id : undefined;
      } while (startingAfter);
    } catch (error) {
      errors.push(`${subscriptionId}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  await logAudit(
    { user: { email: authz.actor } },
    "sync",
    "commerce_charge",
    "stripe-invoices",
    `同步 Stripe 收款：${ordersReconciled}/${checkoutSessionsSeen} 笔一次性订单，${upserted}/${invoicesSeen} 张订阅发票入账`,
  );

  return NextResponse.json({
    ok: true,
    checkoutSessionsSeen,
    ordersReconciled,
    subscriptions: subOrders.length,
    invoicesSeen,
    upserted,
    errors,
  });
}
