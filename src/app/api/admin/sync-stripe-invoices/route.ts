import { NextResponse } from "next/server";
import { isNotNull } from "drizzle-orm";
import type Stripe from "stripe";
import { auth } from "@/auth";
import { db } from "@/db";
import { commerceCharges, commerceOrders } from "@/db/schema";
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

  const subOrders = await db
    .select()
    .from(commerceOrders)
    .where(isNotNull(commerceOrders.stripeSubscriptionId));

  let invoicesSeen = 0;
  let upserted = 0;
  const errors: string[] = [];

  for (const order of subOrders) {
    const subscriptionId = order.stripeSubscriptionId!;
    try {
      const invoices = await stripe.invoices.list({
        subscription: subscriptionId,
        limit: 100,
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
    } catch (error) {
      errors.push(`${subscriptionId}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  await logAudit(
    { user: { email: authz.actor } },
    "sync",
    "commerce_charge",
    "stripe-invoices",
    `同步 Stripe 账单：${subOrders.length} 个订阅，${upserted}/${invoicesSeen} 张发票入账`,
  );

  return NextResponse.json({
    ok: true,
    subscriptions: subOrders.length,
    invoicesSeen,
    upserted,
    errors,
  });
}
