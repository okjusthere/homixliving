import { dbDatePart } from "@/lib/db-time";
import "server-only";
import type Stripe from "stripe";
import { and, desc, eq, gt, inArray, isNotNull, ne, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents, commerceOrders, onboardingEvents, teamJoinRequests, type Agent, type CommerceOrder } from "@/db/schema";
import { lockAgentLedgers, lockOnboardingAgent, type DbTransaction } from "@/lib/advisory-locks";
import { onboardingAgreementAllowsPayment, onboardingPaymentProduct } from "@/lib/onboarding";
import { fullyWaivedOnboarding } from "@/lib/onboarding-fees";
import { canPurchasePlanProduct, settlePlanPayment } from "@/lib/plan-payments";
import { stripeMetadataScope } from "@/lib/commerce/stripe-app";
import { stripeId } from "@/lib/stripe";

export class OnboardingStripeConflict extends Error {
  readonly status = 409;
}

export const STRIPE_RECONCILIATION_EVENT = "onboarding_stripe_payment_reconciliation_required";
const APPLIED_EVENT = "onboarding_stripe_payment_applied";
const CLOSED_CHECKOUT_STATUSES = ["expired", "checkout_not_created"];

/** Admin-only callers can batch this into records.staleSettlements / finance tasks.
 * A later valid renewal does not silently resolve an earlier overpayment. */
export async function getOnboardingStaleSettlements(agentIds: number[]) {
  if (!agentIds.length) return [];
  const rows = await db.select({ id: onboardingEvents.id, agentId: onboardingEvents.agentId,
    createdAt: onboardingEvents.createdAt, detail: onboardingEvents.detail,
  }).from(onboardingEvents).where(and(inArray(onboardingEvents.agentId, agentIds),
    eq(onboardingEvents.eventType, STRIPE_RECONCILIATION_EVENT),
  )).orderBy(desc(onboardingEvents.createdAt));
  return rows.map(row => ({ id: row.id, agentId: row.agentId, createdAt: row.createdAt,
    orderId: Number(row.detail?.orderId), sourceKey: String(row.detail?.sourceKey || ""),
    kind: String(row.detail?.kind || "checkout"),
    actualAmountCents: Number(row.detail?.actualAmountCents), currency: String(row.detail?.currency || "usd"),
    reason: String(row.detail?.reason || "Actual Stripe payment requires finance reconciliation."),
  }));
}

export function isOnboardingStripeOrder(order: CommerceOrder) {
  return order.agentId !== null && order.paymentChannel === "stripe" && order.licenseTransferFeeCents > 0;
}

/** Same lock order as manual receipt matching/completion. No Stripe call under these locks. */
async function lockSubject(tx: DbTransaction, agentId: number) {
  await lockAgentLedgers(tx, [agentId]);
  await lockOnboardingAgent(tx, agentId);
  const [agent] = await tx.select().from(agents).where(eq(agents.id, agentId)).for("update");
  if (!agent) throw new OnboardingStripeConflict("Agent not found. Refresh the current status.");
  return agent;
}

/** Caller must already hold the subject locks. Unknown/failed creation is NOT proof of expiry. */
export async function onboardingCheckoutBlockReason(tx: DbTransaction, agentId: number) {
  const [open] = await tx.select({ id: commerceOrders.id }).from(commerceOrders).where(and(
    eq(commerceOrders.agentId, agentId), eq(commerceOrders.paymentChannel, "stripe"),
    gt(commerceOrders.licenseTransferFeeCents, 0),
    notInArray(commerceOrders.status, [...CLOSED_CHECKOUT_STATUSES, "paid", "active"]),
  )).limit(1);
  return open
    ? `Stripe checkout #${open.id} is open or its outcome is unknown. Close it in Stripe and verify that it expired before approving, waiving or matching another payment. Do not collect again.`
    : null;
}

/** Commit a durable reservation BEFORE making the external create call. */
export async function reservePlanCheckout(expected: Agent, values: typeof commerceOrders.$inferInsert) {
  return db.transaction(async (tx) => {
    const fresh = await lockSubject(tx, expected.id);
    if (fresh.updatedAt !== expected.updatedAt || fresh.accountStatus !== expected.accountStatus)
      throw new OnboardingStripeConflict("Onboarding changed while checkout was starting. Refresh before paying; do not retry an old payment page.");
    if (fresh.accountStatus === "inactive") throw new OnboardingStripeConflict("The account is inactive.");
    const purchase = canPurchasePlanProduct(fresh, values.productKey);
    if (!purchase.ok) throw new OnboardingStripeConflict(purchase.error);
    if (fresh.accountStatus === "pending") {
      if (!onboardingAgreementAllowsPayment(fresh)) throw new OnboardingStripeConflict("Sign the affiliation agreement before paying.");
      if (fresh.onboardingFeeAdjustment || fullyWaivedOnboarding(fresh))
        throw new OnboardingStripeConflict("The office must confirm the company fee adjustment before another Stripe checkout is opened.");
      // An initial invoice may be paid/active before Checkout activates the agent.
      // For a NEW checkout, only proven closure without payment evidence releases an old order.
      const [existingOrder] = await tx.select({ id: commerceOrders.id }).from(commerceOrders).where(and(
        eq(commerceOrders.agentId, fresh.id), gt(commerceOrders.licenseTransferFeeCents, 0),
        or(isNotNull(commerceOrders.paidAt), notInArray(commerceOrders.status, CLOSED_CHECKOUT_STATUSES)),
      )).limit(1);
      if (existingOrder) throw new OnboardingStripeConflict(
        `Stripe checkout cannot start: onboarding order #${existingOrder.id} is already paid or awaiting resolution. Refresh the existing payment; do not collect again.`);
    }
    const [order] = await tx.insert(commerceOrders).values(values).returning();
    return order;
  });
}

export async function withOnboardingStripeOrder<T>(order: CommerceOrder,
  work: (tx: DbTransaction, agent: Agent, current: CommerceOrder) => Promise<T>) {
  if (!isOnboardingStripeOrder(order)) throw new OnboardingStripeConflict("Not an onboarding Stripe order.");
  return db.transaction(async (tx) => {
    const agent = await lockSubject(tx, order.agentId!);
    const [current] = await tx.select().from(commerceOrders).where(eq(commerceOrders.id, order.id)).for("update");
    if (!current || current.agentId !== agent.id || !isOnboardingStripeOrder(current))
      throw new OnboardingStripeConflict("The checkout order changed. Finance reconciliation is required.");
    return work(tx, agent, current);
  });
}

function checkSessionIdentity(order: CommerceOrder, session: Stripe.Checkout.Session) {
  const scope = stripeMetadataScope(session.metadata);
  if (scope === "foreign" ||
    (order.stripeCheckoutSessionId && order.stripeCheckoutSessionId !== session.id) ||
    (scope === "legacy" && order.stripeCheckoutSessionId !== session.id) ||
    (scope === "owned" && session.metadata?.orderId !== String(order.id)) ||
    (session.metadata?.agentId && session.metadata.agentId !== String(order.agentId)))
    throw new OnboardingStripeConflict("Stripe checkout ownership does not match this onboarding order.");
}

export async function attachOnboardingCheckout(order: CommerceOrder, session: Stripe.Checkout.Session) {
  return withOnboardingStripeOrder(order, async (tx, _agent, current) => {
    checkSessionIdentity(current, session);
    // A webhook can win the race with the create response. Never downgrade its payment facts.
    await tx.update(commerceOrders).set({
      stripeCheckoutSessionId: session.id, stripeCustomerId: stripeId(session.customer) || current.stripeCustomerId,
      stripeSubscriptionId: stripeId(session.subscription) || current.stripeSubscriptionId,
      stripePaymentIntentId: stripeId(session.payment_intent) || current.stripePaymentIntentId,
      checkoutUrl: session.url, updatedAt: new Date().toISOString(),
    }).where(eq(commerceOrders.id, current.id));
  });
}

export async function recordUnpaidOnboardingCheckout(order: CommerceOrder, session: Stripe.Checkout.Session) {
  return withOnboardingStripeOrder(order, async (tx, _agent, current) => {
    checkSessionIdentity(current, session);
    if (current.paidAt || ["paid", "active"].includes(current.status)) return;
    await tx.update(commerceOrders).set({ status: "open", stripeCheckoutSessionId: session.id,
      stripeCustomerId: stripeId(session.customer), stripeSubscriptionId: stripeId(session.subscription),
      stripePaymentIntentId: stripeId(session.payment_intent), updatedAt: new Date().toISOString(),
    }).where(eq(commerceOrders.id, current.id));
  });
}

export async function markOnboardingCheckoutCreationFailed(order: CommerceOrder, createAttempted: boolean) {
  return withOnboardingStripeOrder(order, async (tx, _agent, current) => {
    if (current.stripeCheckoutSessionId || current.paidAt || ["paid", "active", "expired"].includes(current.status)) return;
    await tx.update(commerceOrders).set({
      status: createAttempted ? "checkout_unknown" : "checkout_not_created", updatedAt: new Date().toISOString(),
    }).where(eq(commerceOrders.id, current.id));
  });
}

/** Only call with a signature-verified webhook or a freshly retrieved Stripe session. */
export async function confirmOnboardingCheckoutExpired(order: CommerceOrder, session: Stripe.Checkout.Session) {
  return withOnboardingStripeOrder(order, async (tx, _agent, current) => {
    checkSessionIdentity(current, session);
    if (session.status !== "expired" || session.payment_status === "paid")
      throw new OnboardingStripeConflict(`Stripe checkout #${order.id} has not expired. Resolve the existing checkout before approving.`);
    if (current.paidAt || ["paid", "active"].includes(current.status)) return false;
    await tx.update(commerceOrders).set({ status: "expired", checkoutUrl: null,
      updatedAt: new Date().toISOString() }).where(eq(commerceOrders.id, current.id));
    return true;
  });
}

/** Optional admin-route preflight: READ Stripe, never expire/refund automatically.
 * Retrieve must have a bounded timeout. The transaction guard remains authoritative. */
export async function verifyOnboardingCheckoutsClosed(agentId: number,
  retrieve: (sessionId: string) => Promise<Stripe.Checkout.Session>) {
  const orders = await db.select().from(commerceOrders).where(and(
    eq(commerceOrders.agentId, agentId), eq(commerceOrders.paymentChannel, "stripe"),
    gt(commerceOrders.licenseTransferFeeCents, 0),
    notInArray(commerceOrders.status, [...CLOSED_CHECKOUT_STATUSES, "paid", "active"]),
  )).limit(6);
  if (orders.length > 5) throw new OnboardingStripeConflict("Multiple unresolved Stripe checkouts need finance review before approval.");
  for (const order of orders) {
    if (!order.stripeCheckoutSessionId)
      throw new OnboardingStripeConflict(`Stripe checkout #${order.id} creation is in progress or unknown. Reconcile its Stripe session before approving; a missing session ID does not prove no payment occurred.`);
    let session: Stripe.Checkout.Session;
    try { session = await retrieve(order.stripeCheckoutSessionId); }
    catch { throw new OnboardingStripeConflict(`Could not verify closure of Stripe checkout #${order.id}. Refresh after Stripe is available; do not collect again.`); }
    if (!await confirmOnboardingCheckoutExpired(order, session))
      throw new OnboardingStripeConflict(`Stripe checkout #${order.id} has payment evidence. Finance must reconcile it; expiry cannot erase payment.`);
  }
}

type StripeSettlementInput = {
  sourceKey: string;
  eventId: string;
  amountCents: number;
  currency: string;
  earnedAt: string;
  kind: "checkout" | "initial_invoice" | "renewal";
  /** Only populated for Stripe subscription_cycle invoices, from their actual line service period. */
  renewalCycleStart?: string | null;
  patch: Partial<Pick<CommerceOrder, "status" | "stripeCheckoutSessionId" | "stripeCustomerId" |
    "stripeSubscriptionId" | "stripePaymentIntentId">>;
  session?: Stripe.Checkout.Session;
};

function isLaterOnboardingCycle(agent: Agent, order: CommerceOrder, input: StripeSettlementInput) {
  if (input.kind !== "renewal" || order.billingMode !== "subscription" || !input.renewalCycleStart || agent.accountStatus !== "active" ||
    onboardingPaymentProduct(agent.plan, agent.affiliationTermMonths) !== order.productKey) return false;
  const start = agent.anniversaryStart || agent.joinedAt || dbDatePart(agent.onboardingFeeAdjustment?.approvedAt);
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(Date.parse(input.renewalCycleStart))) return false;
  const [year, month, day] = start.split("-").map(Number);
  const months = agent.affiliationTermMonths === 24 ? 24 : 12;
  const lastDay = new Date(Date.UTC(year, month + months, 0)).getUTCDate();
  const end = new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay))).toISOString().slice(0, 10);
  return dbDatePart(input.renewalCycleStart) >= end;
}

/** Actual Stripe income and its reconciliation decision commit together.
 * A late payment is never refunded, discarded or allowed to replace a manual basis. */
export async function settleOnboardingStripePayment(order: CommerceOrder, input: StripeSettlementInput) {
  return withOnboardingStripeOrder(order, async (tx, agent, current) => {
    if (input.session) checkSessionIdentity(current, input.session);
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0)
      throw new OnboardingStripeConflict("Stripe did not provide a valid actual payment amount.");
    const [prior] = await tx.select({ type: onboardingEvents.eventType }).from(onboardingEvents).where(and(
      eq(onboardingEvents.agentId, agent.id), inArray(onboardingEvents.eventType, [APPLIED_EVENT, STRIPE_RECONCILIATION_EVENT]),
      sql`${onboardingEvents.detail}->>'sourceKey' = ${input.sourceKey}`,
    )).limit(1);
    if (prior) return { order: current, reconciliationRequired: prior.type === STRIPE_RECONCILIATION_EVENT, automaticallyActivated: false, replayed: true };

    const [otherPayment] = await tx.select({ id: commerceOrders.id }).from(commerceOrders).where(and(
      eq(commerceOrders.agentId, agent.id), ne(commerceOrders.id, current.id), gt(commerceOrders.licenseTransferFeeCents, 0),
      inArray(commerceOrders.status, ["paid", "active"]),
    )).limit(1);
    const [priorReconciliation] = await tx.select({ id: onboardingEvents.id }).from(onboardingEvents).where(and(
      eq(onboardingEvents.agentId, agent.id), eq(onboardingEvents.eventType, STRIPE_RECONCILIATION_EVENT),
      sql`${onboardingEvents.detail}->>'orderId' = ${String(current.id)}`,
    )).limit(1);
    const [pendingTeam] = await tx.select({ id: teamJoinRequests.id }).from(teamJoinRequests).where(and(
      eq(teamJoinRequests.agentId, agent.id), eq(teamJoinRequests.status, "pending"),
    )).limit(1);
    const purchase = canPurchasePlanProduct(agent, current.productKey, { settlement: true });
    // The initial waiver/receipt covers one onboarding term, never all future subscription cycles.
    const laterCycle = isLaterOnboardingCycle(agent, current, input);
    let reason: string | null = null;
    if (!laterCycle && priorReconciliation) reason = "This onboarding-period payment already requires finance reconciliation.";
    else if (!laterCycle && (agent.onboardingFeeAdjustment || fullyWaivedOnboarding(agent))) reason = "A company waiver/reduction is already approved for this onboarding term; preserve it and reconcile this actual Stripe payment.";
    else if (!laterCycle && otherPayment) reason = `Onboarding already has payment #${otherPayment.id}; reconcile this additional actual payment.`;
    else if (agent.accountStatus === "inactive") reason = "The account is inactive; payment does not restore access.";
    else if (!purchase.ok) reason = purchase.error;
    else if (input.kind !== "renewal" && agent.accountStatus !== "pending" && !current.paidAt)
      reason = "The account was activated before this checkout settled; finance must confirm its billing basis.";
    else if (agent.accountStatus === "pending" && (!agent.onboardingCompletedAt || !onboardingAgreementAllowsPayment(agent) || pendingTeam ||
      (agent.plan === "team_member" && (!agent.teamId || !agent.teamTermsConfigId || !agent.teamTermsAcceptedAt))))
      reason = "Payment received, but the current profile, contract or team approval requires review.";
    else if (input.currency !== "usd" || input.amountCents === 0)
      reason = "The actual Stripe currency/amount needs finance verification before onboarding settlement.";

    const [paid] = await tx.update(commerceOrders).set({ ...input.patch,
      ...(input.kind === "checkout" ? { amountCents: input.amountCents, currency: input.currency } : {}),
      paidAt: current.paidAt || input.earnedAt, updatedAt: new Date().toISOString(),
    }).where(eq(commerceOrders.id, current.id)).returning();
    let automaticallyActivated = false;
    if (!reason && input.kind !== "initial_invoice") {
      const settlement = await settlePlanPayment(tx, { order: paid, sourceKey: input.sourceKey,
        amountCents: input.amountCents, rewardEligibleAmountCents: input.kind === "checkout"
          ? Math.max(0, input.amountCents - current.licenseTransferFeeCents) : input.amountCents,
        earnedAt: input.earnedAt });
      automaticallyActivated = settlement?.automaticallyActivated ?? false;
    }
    await tx.insert(onboardingEvents).values({ agentId: agent.id,
      eventType: reason ? STRIPE_RECONCILIATION_EVENT : APPLIED_EVENT,
      detail: { orderId: current.id, sourceKey: input.sourceKey, eventId: input.eventId,
        kind: input.kind, actualAmountCents: input.amountCents, currency: input.currency,
        reason: reason || "Actual Stripe payment recorded against the current onboarding basis." },
    });
    return { order: paid, reconciliationRequired: Boolean(reason), automaticallyActivated, replayed: false };
  });
}
