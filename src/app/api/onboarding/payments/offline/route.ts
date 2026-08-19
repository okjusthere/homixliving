import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, commerceOrders } from "@/db/schema";
import { requireAdminApi } from "@/lib/auth-guards";
import { getCommerceProduct } from "@/lib/commerce/catalog";
import { logAudit } from "@/lib/audit";
import { onboardingPaymentProduct } from "@/lib/onboarding";
import { settlePlanPayment } from "@/lib/plan-payments";
import { lockAgentLedgers } from "@/lib/advisory-locks";

const METHODS = new Set(["cash", "check", "ach", "zelle", "wire", "other"]);

class OfflinePaymentConflictError extends Error {}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const agentId = Number(body.agentId);
  const method = String(body.method || "").trim().toLowerCase();
  const reference = String(body.reference || "").trim().slice(0, 120);
  const idempotencyKey = String(body.idempotencyKey || "").trim().slice(0, 120);
  const receivedAtInput = String(body.receivedAt || "").trim();
  const receivedAt = /^\d{4}-\d{2}-\d{2}$/.test(receivedAtInput)
    ? new Date(`${receivedAtInput}T12:00:00.000Z`).toISOString()
    : "";
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return NextResponse.json({ error: "Valid agentId is required" }, { status: 400 });
  }
  if (!METHODS.has(method)) {
    return NextResponse.json({ error: "Select a valid payment method" }, { status: 400 });
  }
  if (!reference) {
    return NextResponse.json({ error: "A receipt, check, or transaction reference is required" }, { status: 400 });
  }
  if (!receivedAt) {
    return NextResponse.json({ error: "receivedAt must be YYYY-MM-DD" }, { status: 400 });
  }
  if (receivedAtInput > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ error: "receivedAt cannot be in the future" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(idempotencyKey)) {
    return NextResponse.json({ error: "A valid idempotencyKey is required" }, { status: 400 });
  }
  const externalPaymentKey = `offline:${idempotencyKey}`;

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  const [existingOrder] = await db
    .select()
    .from(commerceOrders)
    .where(eq(commerceOrders.externalPaymentKey, externalPaymentKey))
    .limit(1);
  if (existingOrder) {
    if (existingOrder.agentId !== agent.id) {
      return NextResponse.json({ error: "Idempotency key belongs to another agent" }, { status: 409 });
    }
    return NextResponse.json({ order: existingOrder, replayed: true });
  }
  if (agent.accountStatus !== "pending") {
    return NextResponse.json({ error: "Offline onboarding payment is only available for pending agents" }, { status: 409 });
  }
  if (agent.paymentStatus === "paid") {
    return NextResponse.json({ error: "The required onboarding fee has already been paid" }, { status: 409 });
  }
  if (!agent.onboardingCompletedAt) {
    return NextResponse.json({ error: "The agent must complete their onboarding profile first" }, { status: 409 });
  }
  if (agent.agreementStatus !== "completed") {
    return NextResponse.json({ error: "The affiliation agreement must be signed before payment" }, { status: 409 });
  }
  if (agent.plan === "team_member" && (!agent.teamTermsConfigId || !agent.teamTermsAcceptedAt)) {
    return NextResponse.json({ error: "The agent must accept the team compensation terms first" }, { status: 409 });
  }
  const productKey = onboardingPaymentProduct(agent.plan, agent.affiliationTermMonths);
  const product = productKey ? getCommerceProduct(productKey) : null;
  if (!product) return NextResponse.json({ error: "Required onboarding product is unavailable" }, { status: 409 });
  const amountCents = Math.round(Number(body.amountCents));
  if (amountCents !== product.amountCents) {
    return NextResponse.json(
      { error: "Offline onboarding payments must match the full signed fee", requiredCents: product.amountCents },
      { status: 409 },
    );
  }

  let result;
  try {
    result = await db.transaction(async (tx) => {
      await lockAgentLedgers(tx, [agent.id]);
      const [existing] = await tx
        .select()
        .from(commerceOrders)
        .where(eq(commerceOrders.externalPaymentKey, externalPaymentKey))
        .limit(1);
      if (existing) {
        if (existing.agentId !== agent.id) throw new OfflinePaymentConflictError();
        return { order: existing, replayed: true, alreadyPaid: false as const };
      }
      const [lockedAgent] = await tx.select().from(agents).where(eq(agents.id, agent.id)).limit(1);
      if (!lockedAgent || lockedAgent.paymentStatus === "paid") {
        return { order: null, replayed: false, alreadyPaid: true as const };
      }
      const now = new Date().toISOString();
      const [order] = await tx.insert(commerceOrders).values({
        agentId: agent.id,
        productKey: product.key,
        productName: product.name,
        billingMode: product.billingMode,
        amountCents,
        currency: product.currency,
        status: "paid",
        paymentChannel: "offline",
        offlineMethod: method,
        offlineReference: reference,
        verifiedByEmail: auth.session.user.email || null,
        externalPaymentKey,
        customerName: agent.legalName || agent.name,
        customerEmail: agent.email,
        referralHasAgent: agent.referredByAgentId ? "yes" : "no",
        workspaceStatus: "not_required",
        paidAt: receivedAt,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await settlePlanPayment(tx, {
        order,
        sourceKey: externalPaymentKey,
        amountCents,
        earnedAt: receivedAt,
      });
      return { order, replayed: false, alreadyPaid: false as const };
    });
  } catch (error) {
    if (error instanceof OfflinePaymentConflictError) {
      return NextResponse.json({ error: "Idempotency key belongs to another agent" }, { status: 409 });
    }
    throw error;
  }

  if (result.alreadyPaid || !result.order) {
    return NextResponse.json({ error: "The required onboarding fee has already been paid" }, { status: 409 });
  }

  if (!result.replayed) {
    await logAudit(
      auth.session,
      "record_offline_payment",
      "commerce_order",
      result.order.id,
      `管理员核验 ${agent.name} 线下入职付款 $${(amountCents / 100).toFixed(2)}（${method}）`,
      { agentId, method, reference, receivedAt, productKey },
    );
  }
  return NextResponse.json({ order: result.order, replayed: result.replayed });
}
