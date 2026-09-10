import type Stripe from "stripe";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { agents, commerceOrders } from "@/db/schema";
import { STRIPE_APP_ID } from "@/lib/commerce/stripe-app";

export type AgentBillingIdentity = {
  id: number;
  email: string;
  name: string;
  legalName?: string | null;
  stripeCustomerId?: string | null;
};

export type StripeCustomerClaim = {
  customerId: string;
  claimed: boolean;
};

export type StripeCustomerRepository = {
  findActiveSubscriptionCustomerIds(agentId: number): Promise<string[]>;
  findLatestPaidCustomerId(agentId: number): Promise<string | null>;
  claimCustomerId(agentId: number, customerId: string): Promise<StripeCustomerClaim>;
};

export class StripeCustomerConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeCustomerConflictError";
  }
}

export class InvalidStripeCustomerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStripeCustomerError";
  }
}

export function normalizeStripeCustomerId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^cus_[A-Za-z0-9]+$/.test(normalized) ? normalized : null;
}

export function isMissingStripeCustomerError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; param?: unknown; raw?: { param?: unknown } };
  return candidate.code === "resource_missing"
    && (candidate.param === "customer" || candidate.raw?.param === "customer");
}

function isStripeCustomerUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    constraint?: unknown;
    cause?: { code?: unknown; constraint?: unknown };
  };
  const code = candidate.code ?? candidate.cause?.code;
  const constraint = candidate.constraint ?? candidate.cause?.constraint;
  return code === "23505" && constraint === "uq_agents_stripe_customer";
}

export function chooseActiveSubscriptionCustomerId(customerIds: string[]): string | null {
  const valid = new Set<string>();
  for (const value of customerIds) {
    const customerId = normalizeStripeCustomerId(value);
    if (!customerId) {
      throw new InvalidStripeCustomerError("An active subscription has an invalid Stripe Customer ID.");
    }
    valid.add(customerId);
  }

  if (valid.size > 1) {
    throw new StripeCustomerConflictError(
      "The agent has active subscriptions under multiple Stripe Customers.",
    );
  }

  return valid.values().next().value ?? null;
}

export function stripeCustomerIdempotencyKey(agentId: number): string {
  return `homixliving-agent-${agentId}-stripe-customer-v1`;
}

export function savedPaymentMethodOptions(): Stripe.Checkout.SessionCreateParams.SavedPaymentMethodOptions {
  return {
    payment_method_save: "enabled",
    payment_method_remove: "enabled",
  };
}

export function checkoutCustomerOptions(
  customerId: string,
): Pick<Stripe.Checkout.SessionCreateParams, "customer" | "saved_payment_method_options"> {
  const customer = normalizeStripeCustomerId(customerId);
  if (!customer) {
    throw new InvalidStripeCustomerError("Checkout requires a valid Stripe Customer ID.");
  }
  return {
    customer,
    saved_payment_method_options: savedPaymentMethodOptions(),
  };
}

const databaseStripeCustomerRepository: StripeCustomerRepository = {
  async findActiveSubscriptionCustomerIds(agentId) {
    const rows = await db
      .select({ stripeCustomerId: commerceOrders.stripeCustomerId })
      .from(commerceOrders)
      .where(and(
        eq(commerceOrders.agentId, agentId),
        eq(commerceOrders.billingMode, "subscription"),
        inArray(commerceOrders.status, ["active", "canceling", "past_due"]),
        isNotNull(commerceOrders.stripeCustomerId),
      ));
    return rows.flatMap((row) => row.stripeCustomerId ? [row.stripeCustomerId] : []);
  },

  async findLatestPaidCustomerId(agentId) {
    const [order] = await db
      .select({ stripeCustomerId: commerceOrders.stripeCustomerId })
      .from(commerceOrders)
      .where(and(
        eq(commerceOrders.agentId, agentId),
        eq(commerceOrders.paymentChannel, "stripe"),
        isNotNull(commerceOrders.paidAt),
        isNotNull(commerceOrders.stripeCustomerId),
      ))
      .orderBy(desc(commerceOrders.paidAt), desc(commerceOrders.updatedAt), desc(commerceOrders.id))
      .limit(1);
    return order?.stripeCustomerId ?? null;
  },

  async claimCustomerId(agentId, customerId) {
    let claimed: { stripeCustomerId: string | null } | undefined;
    try {
      [claimed] = await db
        .update(agents)
        .set({ stripeCustomerId: customerId, updatedAt: new Date().toISOString() })
        .where(and(eq(agents.id, agentId), isNull(agents.stripeCustomerId)))
        .returning({ stripeCustomerId: agents.stripeCustomerId });
    } catch (error) {
      if (isStripeCustomerUniqueViolation(error)) {
        throw new StripeCustomerConflictError(
          "The Stripe Customer is already assigned to another portal agent.",
        );
      }
      throw error;
    }

    if (claimed?.stripeCustomerId) {
      return { customerId: claimed.stripeCustomerId, claimed: true };
    }

    const [current] = await db
      .select({ stripeCustomerId: agents.stripeCustomerId })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    const canonical = normalizeStripeCustomerId(current?.stripeCustomerId);
    if (!canonical) {
      throw new InvalidStripeCustomerError("The agent has no valid canonical Stripe Customer.");
    }
    return { customerId: canonical, claimed: false };
  },
};

export async function resolveStripeCustomerForAgent({
  agent,
  stripe,
  repository = databaseStripeCustomerRepository,
}: {
  agent: AgentBillingIdentity;
  stripe: Stripe;
  repository?: StripeCustomerRepository;
}): Promise<string> {
  if (agent.stripeCustomerId) {
    const existing = normalizeStripeCustomerId(agent.stripeCustomerId);
    if (!existing) {
      throw new InvalidStripeCustomerError("The agent's Stripe billing profile is invalid.");
    }
    return existing;
  }

  const activeCustomer = chooseActiveSubscriptionCustomerId(
    await repository.findActiveSubscriptionCustomerIds(agent.id),
  );
  const latestPaidRaw = activeCustomer ? null : await repository.findLatestPaidCustomerId(agent.id);
  const latestPaidCustomer = normalizeStripeCustomerId(latestPaidRaw);
  if (latestPaidRaw && !latestPaidCustomer) {
    throw new InvalidStripeCustomerError("A paid order has an invalid Stripe Customer ID.");
  }
  const legacyCustomer = activeCustomer || latestPaidCustomer;

  if (legacyCustomer) {
    return (await repository.claimCustomerId(agent.id, legacyCustomer)).customerId;
  }

  const customer = await stripe.customers.create(
    {
      email: agent.email,
      name: agent.legalName || agent.name,
      metadata: {
        agentId: String(agent.id),
        app: STRIPE_APP_ID,
        application: "homixliving",
      },
    },
    { idempotencyKey: stripeCustomerIdempotencyKey(agent.id) },
  );

  const customerId = normalizeStripeCustomerId(customer.id);
  if (!customerId) {
    throw new InvalidStripeCustomerError("Stripe returned an invalid Customer ID.");
  }
  return (await repository.claimCustomerId(agent.id, customerId)).customerId;
}

export type StripeCustomerSyncResult = {
  status: "attached" | "matched" | "conflict";
  customerId: string;
};

export async function syncAgentStripeCustomer({
  agentId,
  customerId,
  repository = databaseStripeCustomerRepository,
}: {
  agentId: number;
  customerId: string;
  repository?: StripeCustomerRepository;
}): Promise<StripeCustomerSyncResult> {
  const incoming = normalizeStripeCustomerId(customerId);
  if (!incoming) {
    throw new InvalidStripeCustomerError("Webhook contained an invalid Stripe Customer ID.");
  }

  const result = await repository.claimCustomerId(agentId, incoming);
  if (result.customerId !== incoming) {
    return { status: "conflict", customerId: result.customerId };
  }
  return {
    status: result.claimed ? "attached" : "matched",
    customerId: result.customerId,
  };
}
