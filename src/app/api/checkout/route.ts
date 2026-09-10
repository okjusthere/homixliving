import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { agents, commerceOrders } from "@/db/schema";
import { validateCheckoutPayload } from "@/lib/commerce/checkout";
import {
  formatProductAmount,
  getCommerceProduct,
  getProductStripePriceId,
} from "@/lib/commerce/catalog";
import { getStripe, stripeId } from "@/lib/stripe";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import {
  onboardingAgreementAllowsPayment,
  SOLO_PRO_UPGRADE_CREDIT_DAYS,
  soloProUpgradeCreditCents,
} from "@/lib/onboarding";
import { syncOnboardingAgreement } from "@/lib/onboarding-agreement";
import {
  canPurchasePlanProduct,
  isPlanPaymentProduct,
  onboardingLicenseTransferFeeCents,
} from "@/lib/plan-payments";
import { ensureStripeProductPrice } from "@/lib/commerce/stripe-products";
import {
  InvalidStripeCustomerError,
  StripeCustomerConflictError,
  isMissingStripeCustomerError,
  resolveStripeCustomerForAgent,
} from "@/lib/commerce/stripe-customer";
import { buildCheckoutSessionParams } from "@/lib/commerce/checkout-session";
import { withStripeAppMetadata } from "@/lib/commerce/stripe-app";

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
  let [agent] = await db.select().from(agents).where(eq(agents.id, session.user.agentId)).limit(1);
  if (!agent || agent.accountStatus === "inactive") {
    return NextResponse.json({ error: "Agent account is unavailable." }, { status: 403 });
  }
  if (
    agent.accountStatus === "pending" &&
    agent.esignEnvelopeId &&
    !onboardingAgreementAllowsPayment(agent)
  ) {
    try {
      agent = await syncOnboardingAgreement(agent);
    } catch (error) {
      console.error("Unable to verify agent signature before checkout", error);
    }
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
    !onboardingAgreementAllowsPayment(agent)
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
  const licenseTransferFeeCents = onboardingLicenseTransferFeeCents(agent, product.key);
  const licenseTransferProduct = licenseTransferFeeCents > 0
    ? getCommerceProduct("license_transfer_fee")
    : null;

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json(
      { error: "Stripe is not configured. Set STRIPE_SECRET_KEY." },
      { status: 503 }
    );
  }
  let licenseTransferPriceId: string | null = null;
  try {
    licenseTransferPriceId = licenseTransferProduct
      ? await ensureStripeProductPrice(stripe, licenseTransferProduct)
      : null;
  } catch (error) {
    console.error("Stripe license transfer price configuration failed", error);
    return NextResponse.json(
      { error: "The license transfer fee is temporarily unavailable. Please try again." },
      { status: 503 },
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
      amountCents: product.amountCents + licenseTransferFeeCents,
      licenseTransferFeeCents,
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

  let resolvedStripeCustomerId: string | null = null;
  try {
    const baseUrl = getBaseUrl(request);
    const stripeCustomerId = await resolveStripeCustomerForAgent({ agent, stripe });
    resolvedStripeCustomerId = stripeCustomerId;
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
            metadata: withStripeAppMetadata({
              agentId: String(agent.id),
              orderId: String(order.id),
            }),
          },
          { idempotencyKey: `solo-pro-upgrade-credit-order-${order.id}` },
        )
      : null;
    const metadata = withStripeAppMetadata({
      orderId: String(order.id),
      productKey: product.key,
      agentId: String(agent.id),
      upgradeCreditCents: String(upgradeCreditCents),
      licenseTransferFeeCents: String(licenseTransferFeeCents),
    });

    const lineItems = [
      { price: priceId, quantity: 1 },
      ...(licenseTransferPriceId ? [{ price: licenseTransferPriceId, quantity: 1 }] : []),
    ];
    const checkoutDescription = licenseTransferFeeCents > 0
      ? `${product.name} + ${licenseTransferProduct!.name} - ${formatProductAmount(order.amountCents)}`
      : `${product.name} - ${formatProductAmount(product.amountCents)}`;

    const session = await stripe.checkout.sessions.create(buildCheckoutSessionParams({
      billingMode: product.billingMode,
      lineItems,
      stripeCustomerId,
      orderId: order.id,
      metadata,
      description: checkoutDescription,
      couponId: upgradeCoupon?.id,
      hasLicenseTransferFee: licenseTransferFeeCents > 0,
      automaticTaxEnabled: process.env.STRIPE_AUTOMATIC_TAX === "1",
      baseUrl,
    }));

    await db
      .update(commerceOrders)
      .set({
        stripeCheckoutSessionId: session.id,
        stripeCustomerId: stripeId(session.customer) || stripeCustomerId,
        stripeSubscriptionId: stripeId(session.subscription),
        stripePaymentIntentId: stripeId(session.payment_intent),
        checkoutUrl: session.url,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(commerceOrders.id, order.id));

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout session creation failed", {
      agentId: agent.id,
      stripeCustomerId: resolvedStripeCustomerId || agent.stripeCustomerId,
      error,
    });
    await db
      .update(commerceOrders)
      .set({ status: "failed", updatedAt: new Date().toISOString() })
      .where(eq(commerceOrders.id, order.id));

    const billingProfileError = error instanceof InvalidStripeCustomerError
      || error instanceof StripeCustomerConflictError
      || isMissingStripeCustomerError(error);
    return NextResponse.json(
      {
        error: billingProfileError
          ? "Your Stripe billing profile needs attention. Contact support before retrying."
          : "Could not start Stripe checkout. Please try again.",
      },
      { status: billingProfileError ? 409 : 500 }
    );
  }
}
