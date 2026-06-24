import { NextResponse } from "next/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { commerceOrders } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { getStripe } from "@/lib/stripe";

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
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const email = authResult.session.user.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Signed-in user email is missing." }, { status: 400 });
  }

  const [order] = await db
    .select({
      stripeCustomerId: commerceOrders.stripeCustomerId,
      updatedAt: commerceOrders.updatedAt,
    })
    .from(commerceOrders)
    .where(
      and(
        eq(commerceOrders.customerEmail, email),
        isNotNull(commerceOrders.stripeCustomerId)
      )
    )
    .orderBy(desc(commerceOrders.updatedAt))
    .limit(1);

  const customer = order?.stripeCustomerId?.trim();
  if (!customer) {
    return NextResponse.json(
      { error: "No Stripe billing profile is connected to this user yet." },
      { status: 404 }
    );
  }

  try {
    const configuration = process.env.STRIPE_CUSTOMER_PORTAL_CONFIGURATION?.trim();
    const session = await getStripe().billingPortal.sessions.create({
      customer,
      return_url: `${getBaseUrl(request)}/`,
      configuration: configuration || undefined,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe customer portal session creation failed", error);
    return NextResponse.json(
      { error: "Could not open the billing portal. Please try again." },
      { status: 500 }
    );
  }
}
