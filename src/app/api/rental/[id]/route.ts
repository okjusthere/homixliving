import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, buildings, dealAgents, deals, invoices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canEditDeal, canViewDeal } from "@/lib/visibility";
import { summarizeInvoicePayment } from "@/lib/invoice-payment";
import { logAudit } from "@/lib/audit";

type DealAgentPayload = {
  agentId: number;
  sharePct: number;
  isPrimary: boolean;
};

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

function parseDealAgents(value: unknown): DealAgentPayload[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((row) => ({
    agentId: parseId((row as Record<string, unknown>).agentId) || 0,
    sharePct: parseNumber((row as Record<string, unknown>).sharePct) ?? Number.NaN,
    isPrimary: Boolean((row as Record<string, unknown>).isPrimary),
  }));
}

async function validateDealUpdate({
  body,
  existing,
  isAdmin,
}: {
  body: Record<string, unknown>;
  existing: typeof deals.$inferSelect;
  isAdmin: boolean;
}) {
  const buildingId = parseId(body.buildingId) || existing.buildingId;
  const totalCommission = parseNumber(body.totalCommission) ?? existing.totalCommission;
  const payloadAgents = parseDealAgents(body.agents);

  if (!stringOrNull(body.unit) || !stringOrNull(body.tenantName)) {
    return { error: "unit and tenantName are required" };
  }
  if (!payloadAgents || payloadAgents.length === 0) {
    return { error: "At least one deal agent is required" };
  }

  const uniqueAgentIds = new Set(payloadAgents.map((agent) => agent.agentId));
  if (uniqueAgentIds.size !== payloadAgents.length || uniqueAgentIds.has(0)) {
    return { error: "Deal agents must be unique valid agents" };
  }
  if (payloadAgents.filter((agent) => agent.isPrimary).length !== 1) {
    return { error: "Exactly one primary agent is required" };
  }
  const shareTotal = payloadAgents.reduce((sum, agent) => sum + agent.sharePct, 0);
  if (payloadAgents.some((agent) => !Number.isFinite(agent.sharePct) || agent.sharePct < 0) || Math.abs(shareTotal - 100) > 0.01) {
    return { error: "Agent shares must sum to 100" };
  }

  const building = await db.select().from(buildings).where(eq(buildings.id, buildingId)).then((rows) => rows[0]);
  if (!building) return { error: "Building not found", status: 404 };

  const agentRows = await Promise.all(
    payloadAgents.map((agent) => db.select().from(agents).where(eq(agents.id, agent.agentId)).then((rows) => rows[0]))
  );
  if (agentRows.some((agent) => !agent)) {
    return { error: "Every deal agent must exist", status: 404 };
  }
  if (!isAdmin && agentRows.some((agent) => agent?.accountStatus !== "active")) {
    return { error: "Every deal agent must be active", status: 400 };
  }

  const status = stringOrNull(body.status) || existing.status;
  if (!["active", "cancelled", "completed"].includes(status)) {
    return { error: "Status must be active, cancelled, or completed" };
  }

  const referrerType = stringOrNull(body.referrerType);
  if (referrerType && !["percent", "flat"].includes(referrerType)) {
    return { error: "Referrer type must be percent or flat" };
  }

  return {
    data: {
      buildingId,
      unit: stringOrNull(body.unit) || existing.unit,
      tenantName: stringOrNull(body.tenantName) || existing.tenantName,
      tenantEmail: stringOrNull(body.tenantEmail),
      tenantPhone: stringOrNull(body.tenantPhone),
      apartmentAddress: stringOrNull(body.apartmentAddress),
      moveInDate: stringOrNull(body.moveInDate),
      leaseStartDate: stringOrNull(body.leaseStartDate),
      leaseEndDate: stringOrNull(body.leaseEndDate),
      rentAmount: parseNumber(body.rentAmount),
      leaseLengthMonths: parseId(body.leaseLengthMonths),
      totalCommission,
      licensedCompany: existing.licensedCompany,
      referrerName: stringOrNull(body.referrerName),
      referrerType,
      referrerAmount: parseNumber(body.referrerAmount),
      referrerPaymentInfo: stringOrNull(body.referrerPaymentInfo),
      status,
      dealDate: stringOrNull(body.dealDate) || existing.dealDate,
      source: stringOrNull(body.source),
      notes: stringOrNull(body.notes),
      updatedAt: new Date().toISOString(),
    },
    agents: payloadAgents,
  };
}

async function serializeDeal(id: number) {
  const deal = await db.select().from(deals).where(eq(deals.id, id)).then((rows) => rows[0]);
  if (!deal) return null;

  const [building, participantRows, linkedInvoices] = await Promise.all([
    db.select().from(buildings).where(eq(buildings.id, deal.buildingId)).then((rows) => rows[0]),
    db
      .select({
        dealAgent: dealAgents,
        agent: agents,
      })
      .from(dealAgents)
      .innerJoin(agents, eq(agents.id, dealAgents.agentId))
      .where(eq(dealAgents.dealId, deal.id)),
    db.select().from(invoices).where(eq(invoices.dealId, deal.id)),
  ]);

  const participants = participantRows.map((row) => ({
    ...row.dealAgent,
    agent: row.agent,
  }));
  const primaryAgent = participants.find((row) => row.isPrimary)?.agent || null;

  return {
    deal,
    building,
    agents: participants,
    primaryAgent,
    linkedInvoices,
    invoiceSummary: summarizeInvoicePayment(linkedInvoices),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const parsedId = parseId(id);
  if (!parsedId) return NextResponse.json({ error: "Valid deal id is required" }, { status: 400 });

  if (!(await canViewDeal(authResult.session, parsedId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const result = await serializeDeal(parsedId);
  if (!result) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

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
  if (!parsedId) return NextResponse.json({ error: "Valid deal id is required" }, { status: 400 });

  if (!(await canEditDeal(authResult.session, parsedId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const existing = await db.select().from(deals).where(eq(deals.id, parsedId)).then((rows) => rows[0]);
    if (!existing) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    const result = await validateDealUpdate({
      body,
      existing,
      isAdmin: authResult.session.user.isAdmin,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    await db.transaction(async (tx) => {
      await tx.update(deals).set(result.data).where(eq(deals.id, parsedId));
      await tx.delete(dealAgents).where(eq(dealAgents.dealId, parsedId));
      for (const agent of result.agents) {
        await tx.insert(dealAgents).values({
          dealId: parsedId,
          agentId: agent.agentId,
          sharePct: agent.sharePct,
          isPrimary: agent.isPrimary,
          createdAt: new Date().toISOString(),
        });
      }
    });

    await logAudit(
      authResult.session,
      "update",
      "rental_deal",
      parsedId,
      `更新租赁成交 #${parsedId} · ${result.data.unit} · 租客 ${result.data.tenantName}`,
      body
    );

    const updated = await serializeDeal(parsedId);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Deal update failed" }, { status: 500 });
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
  if (!parsedId) return NextResponse.json({ error: "Valid deal id is required" }, { status: 400 });

  if (!(await canEditDeal(authResult.session, parsedId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  await db.update(invoices).set({ dealId: null, updatedAt: new Date().toISOString() }).where(eq(invoices.dealId, parsedId));
  await db.delete(deals).where(eq(deals.id, parsedId));
  await logAudit(
    authResult.session,
    "delete",
    "rental_deal",
    parsedId,
    `删除租赁成交 #${parsedId}（关联发票已解除绑定）`
  );
  return NextResponse.json({ success: true });
}
