import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents, sponsorPlanRewards, type Agent, type CommerceOrder } from "@/db/schema";
import type { CommerceProductKey } from "@/lib/commerce/catalog";
import { onboardingPaymentProduct } from "@/lib/onboarding";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTransaction;

export const PLAN_PAYMENT_PRODUCTS = new Set<CommerceProductKey>([
  "one_year_membership",
  "two_year_membership",
  "elite_desk_fee",
  "growth_desk_fee",
]);

export function isPlanPaymentProduct(key: string): key is CommerceProductKey {
  return PLAN_PAYMENT_PRODUCTS.has(key as CommerceProductKey);
}

export function canPurchasePlanProduct(
  agent: Agent,
  productKey: string,
  options: { settlement?: boolean } = {},
) {
  if (!isPlanPaymentProduct(productKey)) return { ok: true as const };
  if (productKey === "growth_desk_fee") {
    return { ok: false as const, error: "The Legacy Growth plan is no longer available for purchase." };
  }
  if (agent.accountStatus === "pending") {
    if (agent.paymentStatus === "paid" && !options.settlement) {
      return { ok: false as const, error: "The required onboarding fee has already been paid." };
    }
    const required = onboardingPaymentProduct(agent.plan, agent.affiliationTermMonths);
    return productKey === required
      ? { ok: true as const }
      : { ok: false as const, error: "This payment does not match the signed compensation plan." };
  }
  if (agent.plan === "team_member" && productKey === "elite_desk_fee") {
    return {
      ok: false as const,
      error: "Team Members must complete an approved team exit before switching to Solo Pro.",
    };
  }
  if (agent.plan === "team_leader" || agent.plan === "solo_pro") {
    return productKey === "elite_desk_fee"
      ? { ok: true as const }
      : { ok: false as const, error: "This plan only renews through the Solo Pro annual fee." };
  }
  return { ok: true as const };
}

export async function settlePlanPayment(
  executor: DbExecutor,
  input: {
    order: CommerceOrder;
    sourceKey: string;
    amountCents: number;
    earnedAt: string;
  },
) {
  if (!isPlanPaymentProduct(input.order.productKey) || input.amountCents <= 0) return null;
  const email = input.order.customerEmail?.trim().toLowerCase();
  const [agent] = input.order.agentId
    ? await executor.select().from(agents).where(eq(agents.id, input.order.agentId)).limit(1)
    : email
      ? await executor.select().from(agents).where(sql`lower(${agents.email}) = ${email}`).limit(1)
      : [];
  if (!agent) return null;

  const allowed = canPurchasePlanProduct(agent, input.order.productKey, { settlement: true });
  if (!allowed.ok) throw new Error(allowed.error);
  const termMonths = input.order.productKey === "two_year_membership" ? 24 : 12;
  const updatedAt = new Date().toISOString();
  const plan = input.order.productKey === "elite_desk_fee" && agent.plan !== "team_leader"
    ? "solo_pro" as const
    : agent.plan;
  await executor.update(agents).set({
    affiliationPaidAt: input.earnedAt.slice(0, 10),
    affiliationTermMonths: termMonths,
    plan,
    splitPct: plan === "solo_pro" ? 100 : agent.splitPct,
    paymentStatus: "paid",
    onboardingStage: agent.accountStatus === "pending" && (
      agent.agreementStatus === "completed" || !agent.esignEnvelopeId
    ) ? "review" : agent.onboardingStage,
    updatedAt,
  }).where(eq(agents.id, agent.id));

  if (!agent.referredByAgentId) return { agentId: agent.id, reward: null };
  const [reward] = await executor.insert(sponsorPlanRewards).values({
    sourceKey: input.sourceKey,
    orderId: input.order.id,
    sponsorAgentId: agent.referredByAgentId,
    referredAgentId: agent.id,
    amountCents: Math.round(input.amountCents * 0.1),
    paidCents: 0,
    status: "accrued",
    earnedAt: input.earnedAt,
    availableAt: input.earnedAt,
  }).onConflictDoNothing({ target: sponsorPlanRewards.sourceKey }).returning();
  return { agentId: agent.id, reward: reward || null };
}
