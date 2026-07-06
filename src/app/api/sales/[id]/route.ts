import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, saleDealAgents, saleDeals } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canEditSaleDeal, canViewSaleDeal } from "@/lib/visibility";
import { logAudit } from "@/lib/audit";

type SaleAgentPayload = {
  agentId: number;
  sharePct: number;
  isPrimary: boolean;
};

const representationTypes = new Set([
  "buyer_rep",
  "seller_rep",
  "dual_agency",
  "referral",
]);
const stages = new Set(["pre_contract", "under_contract", "post_contract", "closed"]);
const statuses = new Set(["active", "cancelled", "completed"]);

function parseId(value: unknown) {
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text ? text : null;
}

function parseSaleAgents(value: unknown): SaleAgentPayload[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((row) => ({
    agentId: parseId((row as Record<string, unknown>).agentId) || 0,
    sharePct: parseNumber((row as Record<string, unknown>).sharePct) ?? Number.NaN,
    isPrimary: Boolean((row as Record<string, unknown>).isPrimary),
  }));
}

async function validateSaleUpdate({
  body,
  existing,
  session,
}: {
  body: Record<string, unknown>;
  existing: typeof saleDeals.$inferSelect;
  session: { user: { agentId: number | null; isAdmin: boolean } };
}) {
  const payloadAgents = parseSaleAgents(body.agents);
  const representationType = stringOrNull(body.representationType) || existing.representationType;
  const stage = stringOrNull(body.stage) || existing.stage;
  const status = stringOrNull(body.status) || existing.status;
  const grossCommission = parseNumber(body.grossCommission) ?? existing.grossCommission;

  if (!stringOrNull(body.propertyAddress)) {
    return { error: "propertyAddress is required" };
  }
  if (!representationTypes.has(representationType)) {
    return { error: "Invalid representation type" };
  }
  if (!stages.has(stage)) {
    return { error: "Invalid stage" };
  }
  if (!statuses.has(status)) {
    return { error: "Invalid status" };
  }
  if (grossCommission < 0) {
    return { error: "grossCommission cannot be negative" };
  }
  if (!payloadAgents || payloadAgents.length === 0) {
    return { error: "At least one sale agent is required" };
  }

  const uniqueAgentIds = new Set(payloadAgents.map((agent) => agent.agentId));
  if (uniqueAgentIds.size !== payloadAgents.length || uniqueAgentIds.has(0)) {
    return { error: "Sale agents must be unique valid agents" };
  }
  if (payloadAgents.filter((agent) => agent.isPrimary).length !== 1) {
    return { error: "Exactly one primary agent is required" };
  }
  const shareTotal = payloadAgents.reduce((sum, agent) => sum + agent.sharePct, 0);
  if (
    payloadAgents.some((agent) => !Number.isFinite(agent.sharePct) || agent.sharePct < 0) ||
    Math.abs(shareTotal - 100) > 0.01
  ) {
    return { error: "Agent shares must sum to 100" };
  }
  if (!session.user.isAdmin && !payloadAgents.some((agent) => agent.agentId === session.user.agentId)) {
    return { error: "Non-admin users must include themselves on the sale", status: 403 };
  }

  const agentRows = await Promise.all(
    payloadAgents.map((agent) => db.select().from(agents).where(eq(agents.id, agent.agentId)).get())
  );
  if (agentRows.some((agent) => !agent)) {
    return { error: "Every sale agent must exist", status: 404 };
  }
  if (agentRows.some((agent) => agent?.isActive === false)) {
    return { error: "Every sale agent must be active", status: 400 };
  }

  return {
    data: {
      representationType,
      stage,
      status,
      propertyAddress: stringOrNull(body.propertyAddress) || existing.propertyAddress,
      city: stringOrNull(body.city),
      state: stringOrNull(body.state),
      zip: stringOrNull(body.zip),
      propertyType: stringOrNull(body.propertyType),
      mlsNumber: stringOrNull(body.mlsNumber),
      fileId: stringOrNull(body.fileId),
      buyerNames: stringOrNull(body.buyerNames),
      sellerNames: stringOrNull(body.sellerNames),
      contractDate: stringOrNull(body.contractDate),
      closingDate: stringOrNull(body.closingDate),
      purchasePrice: parseNumber(body.purchasePrice),
      grossCommission,
      referralAmount: parseNumber(body.referralAmount),
      brokerageFee: parseNumber(body.brokerageFee),
      listingAgentName: stringOrNull(body.listingAgentName),
      listingAgentEmail: stringOrNull(body.listingAgentEmail),
      listingBrokerage: stringOrNull(body.listingBrokerage),
      cooperatingAgentName: stringOrNull(body.cooperatingAgentName),
      cooperatingAgentEmail: stringOrNull(body.cooperatingAgentEmail),
      cooperatingBrokerage: stringOrNull(body.cooperatingBrokerage),
      buyerAttorney: stringOrNull(body.buyerAttorney),
      sellerAttorney: stringOrNull(body.sellerAttorney),
      titleCompany: stringOrNull(body.titleCompany),
      lenderName: stringOrNull(body.lenderName),
      escrowHolder: stringOrNull(body.escrowHolder),
      source: stringOrNull(body.source),
      notes: stringOrNull(body.notes),
      updatedAt: new Date().toISOString(),
    },
    agents: payloadAgents,
  };
}

async function serializeSaleDeal(id: number) {
  const saleDeal = await db.select().from(saleDeals).where(eq(saleDeals.id, id)).get();
  if (!saleDeal) return null;

  const participantRows = await db
    .select({
      saleDealAgent: saleDealAgents,
      agent: agents,
    })
    .from(saleDealAgents)
    .innerJoin(agents, eq(agents.id, saleDealAgents.agentId))
    .where(eq(saleDealAgents.saleDealId, saleDeal.id));

  const participants = participantRows.map((row) => ({
    ...row.saleDealAgent,
    agent: row.agent,
  }));
  const primaryAgent = participants.find((row) => row.isPrimary)?.agent || null;

  return { saleDeal, agents: participants, primaryAgent };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const parsedId = parseId(id);
  if (!parsedId) return NextResponse.json({ error: "Valid sale id is required" }, { status: 400 });

  if (!(await canViewSaleDeal(authResult.session, parsedId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const result = await serializeSaleDeal(parsedId);
  if (!result) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

  return NextResponse.json(result);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const parsedId = parseId(id);
  if (!parsedId) return NextResponse.json({ error: "Valid sale id is required" }, { status: 400 });

  if (!(await canEditSaleDeal(authResult.session, parsedId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const existing = await db.select().from(saleDeals).where(eq(saleDeals.id, parsedId)).get();
    if (!existing) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

    const result = await validateSaleUpdate({ body, existing, session: authResult.session });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    await db.batch([
      db.update(saleDeals).set(result.data).where(eq(saleDeals.id, parsedId)),
      db.delete(saleDealAgents).where(eq(saleDealAgents.saleDealId, parsedId)),
      ...result.agents.map((agent) =>
        db.insert(saleDealAgents).values({
          saleDealId: parsedId,
          agentId: agent.agentId,
          sharePct: agent.sharePct,
          isPrimary: agent.isPrimary,
          createdAt: new Date().toISOString(),
        })
      ),
    ]);

    await logAudit(
      authResult.session,
      "update",
      "sale_deal",
      parsedId,
      `更新买卖成交 #${parsedId} · ${result.data.propertyAddress}`,
      body
    );

    const updated = await serializeSaleDeal(parsedId);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Sale update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const parsedId = parseId(id);
  if (!parsedId) return NextResponse.json({ error: "Valid sale id is required" }, { status: 400 });

  if (!(await canEditSaleDeal(authResult.session, parsedId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  await db.delete(saleDeals).where(eq(saleDeals.id, parsedId));
  await logAudit(authResult.session, "delete", "sale_deal", parsedId, `删除买卖成交 #${parsedId}`);
  return NextResponse.json({ success: true });
}
