import { NextResponse } from "next/server";
import { db } from "@/db";
import { commerceOrders } from "@/db/schema";
import { validateCheckoutPayload } from "@/lib/commerce/checkout";
import { formatProductAmount, getProductStripePriceId } from "@/lib/commerce/catalog";
import { getStripe, stripeId } from "@/lib/stripe";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBaseUrl(request: Request): string {
  const configured =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL;

  if (configured) return configured.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = validateCheckoutPayload(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { product, payload } = result;
  const priceId = getProductStripePriceId(product);
  if (!priceId) {
    return NextResponse.json(
      { error: `${product.priceEnvVar} is not configured.` },
      { status: 503 }
    );
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json(
      { error: "Stripe is not configured. Set STRIPE_SECRET_KEY." },
      { status: 503 }
    );
  }

  const now = new Date().toISOString();
  const [order] = await db
    .insert(commerceOrders)
    .values({
      productKey: product.key,
      productName: product.name,
      billingMode: product.billingMode,
      stripePriceId: priceId,
      amountCents: product.amountCents,
      currency: product.currency,
      status: "pending",
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      requestedWorkspaceEmail: payload.requestedWorkspaceEmail,
      phone: payload.phone,
      referralHasAgent: payload.referralHasAgent,
      referralAgentName: payload.referralAgentName,
      message: payload.message,
      workspaceStatus: product.requiresWorkspaceEmail ? "pending" : "not_required",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!order) {
    return NextResponse.json({ error: "Could not create checkout order." }, { status: 500 });
  }

  try {
    const baseUrl = getBaseUrl(request);
    const metadata = {
      orderId: String(order.id),
      productKey: product.key,
    };

    const session = await stripe.checkout.sessions.create({
      mode: product.billingMode,
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: payload.customerEmail,
      client_reference_id: String(order.id),
      metadata,
      subscription_data:
        product.billingMode === "subscription"
          ? {
              metadata,
              description: `${product.name} - ${formatProductAmount(product.amountCents)}`,
            }
          : undefined,
      payment_intent_data:
        product.billingMode === "payment"
          ? {
              metadata,
              description: `${product.name} - ${formatProductAmount(product.amountCents)}`,
            }
          : undefined,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === "1" },
      success_url: `${baseUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pay?canceled=1`,
    });

    await db
      .update(commerceOrders)
      .set({
        stripeCheckoutSessionId: session.id,
        stripeCustomerId: stripeId(session.customer),
        stripeSubscriptionId: stripeId(session.subscription),
        stripePaymentIntentId: stripeId(session.payment_intent),
        checkoutUrl: session.url,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(commerceOrders.id, order.id));

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout session creation failed", error);
    await db
      .update(commerceOrders)
      .set({ status: "failed", updatedAt: new Date().toISOString() })
      .where(eq(commerceOrders.id, order.id));

    return NextResponse.json(
      { error: "Could not start Stripe checkout. Please try again." },
      { status: 500 }
    );
  }
}
