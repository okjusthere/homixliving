import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { agents, commerceOrders } from "@/db/schema";
import { validateCheckoutPayload } from "@/lib/commerce/checkout";
import { formatProductAmount, getProductStripePriceId } from "@/lib/commerce/catalog";
import { getStripe, stripeId } from "@/lib/stripe";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import {
  SOLO_PRO_UPGRADE_CREDIT_DAYS,
  soloProUpgradeCreditCents,
} from "@/lib/onboarding";
import { canPurchasePlanProduct, isPlanPaymentProduct } from "@/lib/plan-payments";

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
  const session = await auth();
  if (!session?.user?.agentId) {
    return NextResponse.json({ error: "Sign in to Homix Agents before paying." }, { status: 401 });
  }
  const [agent] = await db.select().from(agents).where(eq(agents.id, session.user.agentId)).limit(1);
  if (!agent || agent.accountStatus === "inactive") {
    return NextResponse.json({ error: "Agent account is unavailable." }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sponsor = agent.referredByAgentId
    ? await db.select({ name: agents.name }).from(agents).where(eq(agents.id, agent.referredByAgentId)).limit(1)
    : [];
  const result = validateCheckoutPayload({
    ...(body && typeof body === "object" ? body : {}),
    customerName: agent.legalName || agent.name,
    customerEmail: agent.email,
    referralHasAgent: agent.referredByAgentId ? "yes" : "no",
    referralAgentName: sponsor[0]?.name || undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { product, payload } = result;
  const purchase = canPurchasePlanProduct(agent, product.key);
  if (!purchase.ok) return NextResponse.json({ error: purchase.error }, { status: 409 });
  const isPlanPayment = isPlanPaymentProduct(product.key);
  if (
    agent.accountStatus === "pending" &&
    isPlanPayment &&
    agent.agreementStatus !== "completed"
  ) {
    return NextResponse.json({ error: "Sign the affiliation agreement before paying." }, { status: 409 });
  }
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
      agentId: agent.id,
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
    let upgradeCreditCents = 0;
    if (product.key === "elite_desk_fee") {
      const threshold = new Date(Date.now() - SOLO_PRO_UPGRADE_CREDIT_DAYS * 86_400_000).toISOString();
      const [priorBasePayment] = await db
        .select({
          productKey: commerceOrders.productKey,
          amountCents: commerceOrders.amountCents,
          paidAt: commerceOrders.paidAt,
        })
        .from(commerceOrders)
        .where(and(
          eq(commerceOrders.agentId, agent.id),
          inArray(commerceOrders.productKey, ["one_year_membership", "two_year_membership"]),
          inArray(commerceOrders.status, ["paid", "active"]),
          gte(commerceOrders.paidAt, threshold),
        ))
        .orderBy(desc(commerceOrders.paidAt))
        .limit(1);
      if (priorBasePayment) {
        upgradeCreditCents = soloProUpgradeCreditCents({
          currentPlan: agent.plan,
          priorProductKey: priorBasePayment.productKey,
          priorAmountCents: priorBasePayment.amountCents,
          priorPaidAt: priorBasePayment.paidAt,
        });
      }
    }
    const upgradeCoupon = upgradeCreditCents > 0
      ? await stripe.coupons.create(
          {
            amount_off: upgradeCreditCents,
            currency: product.currency,
            duration: "once",
            name: "90-day Solo Pro upgrade credit",
            metadata: { agentId: String(agent.id), orderId: String(order.id) },
          },
          { idempotencyKey: `solo-pro-upgrade-credit-order-${order.id}` },
        )
      : null;
    const metadata = {
      orderId: String(order.id),
      productKey: product.key,
      agentId: String(agent.id),
      upgradeCreditCents: String(upgradeCreditCents),
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
      discounts: upgradeCoupon ? [{ coupon: upgradeCoupon.id }] : undefined,
      allow_promotion_codes: upgradeCoupon ? undefined : true,
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
