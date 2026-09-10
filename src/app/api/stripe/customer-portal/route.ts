import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { getStripe } from "@/lib/stripe";
import {
  InvalidStripeCustomerError,
  StripeCustomerConflictError,
  isMissingStripeCustomerError,
  resolveStripeCustomerForAgent,
} from "@/lib/commerce/stripe-customer";

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

  const agentId = authResult.session.user.agentId;
  if (!agentId) {
    return NextResponse.json({ error: "Signed-in agent is missing." }, { status: 400 });
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  if (!agent || agent.accountStatus === "inactive") {
    return NextResponse.json(
      { error: "Agent account is unavailable." },
      { status: 404 }
    );
  }

  try {
    const stripe = getStripe();
    const customer = await resolveStripeCustomerForAgent({ agent, stripe });
    const configuration = process.env.STRIPE_CUSTOMER_PORTAL_CONFIGURATION?.trim();
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${getBaseUrl(request)}/`,
      configuration: configuration || undefined,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe customer portal session creation failed", {
      agentId: agent.id,
      stripeCustomerId: agent.stripeCustomerId,
      error,
    });
    const billingProfileError = error instanceof InvalidStripeCustomerError
      || error instanceof StripeCustomerConflictError
      || isMissingStripeCustomerError(error);
    return NextResponse.json(
      {
        error: billingProfileError
          ? "Your Stripe billing profile needs attention. Contact support before retrying."
          : "Could not open the billing portal. Please try again.",
      },
      { status: billingProfileError ? 409 : 500 }
    );
  }
}
