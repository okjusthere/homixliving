import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, buildings, dealAgents, deals, invoices } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { getDealDate } from "@/lib/reporting";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { dealsVisibleToSql } from "@/lib/visibility";
import { summarizeInvoicePayment } from "@/lib/invoice-payment";

type DealAgentPayload = {
  agentId: number;
  sharePct: number;
  isPrimary: boolean;
};

function parseNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseId(value: unknown) {
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text ? text : null;
}

function parseDealAgents(value: unknown): DealAgentPayload[] | null {
  if (!Array.isArray(value)) return null;
  const rows = value.map((row) => ({
    agentId: parseId((row as Record<string, unknown>).agentId) || 0,
    sharePct: parseNumber((row as Record<string, unknown>).sharePct) ?? Number.NaN,
    isPrimary: Boolean((row as Record<string, unknown>).isPrimary),
  }));
  return rows;
}

async function cleanDealPayload(
  body: Record<string, unknown>,
  session: { user: { agentId: number | null; isAdmin: boolean } },
  options: { allowInactiveAgents?: boolean } = {}
) {
  const buildingId = parseId(body.buildingId);
  const totalCommission = parseNumber(body.totalCommission);
  const payloadAgents = parseDealAgents(body.agents);

  if (!buildingId || !stringOrNull(body.unit) || !stringOrNull(body.tenantName) || totalCommission === null) {
    return { error: "buildingId, unit, tenantName, and totalCommission are required" };
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
  if (!session.user.isAdmin && !payloadAgents.some((agent) => agent.agentId === session.user.agentId)) {
    return { error: "Non-admin users must include themselves on the deal", status: 403 };
  }

  const building = await db.select().from(buildings).where(eq(buildings.id, buildingId)).get();
  if (!building) return { error: "Building not found", status: 404 };

  const agentRows = await Promise.all(
    payloadAgents.map((agent) => db.select().from(agents).where(eq(agents.id, agent.agentId)).get())
  );
  if (agentRows.some((agent) => !agent)) {
    return { error: "Every deal agent must exist", status: 404 };
  }
  if (!options.allowInactiveAgents && agentRows.some((agent) => agent?.isActive === false)) {
    return { error: "Every deal agent must be active", status: 400 };
  }

  const primaryPayload = payloadAgents.find((agent) => agent.isPrimary)!;
  const primaryAgent = agentRows.find((agent) => agent?.id === primaryPayload.agentId);
  if (!primaryAgent) return { error: "Primary agent not found", status: 404 };

  const status = stringOrNull(body.status) || "active";
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
      unit: stringOrNull(body.unit) || "",
      tenantName: stringOrNull(body.tenantName) || "",
      tenantEmail: stringOrNull(body.tenantEmail),
      tenantPhone: stringOrNull(body.tenantPhone),
      apartmentAddress: stringOrNull(body.apartmentAddress),
      moveInDate: stringOrNull(body.moveInDate),
      leaseStartDate: stringOrNull(body.leaseStartDate),
      leaseEndDate: stringOrNull(body.leaseEndDate),
      rentAmount: parseNumber(body.rentAmount),
      leaseLengthMonths: parseId(body.leaseLengthMonths),
      totalCommission,
      licensedCompany: stringOrNull(body.licensedCompany) || primaryAgent.licensedCompany || "Homix Living Inc.",
      referrerName: stringOrNull(body.referrerName),
      referrerType,
      referrerAmount: parseNumber(body.referrerAmount),
      referrerPaymentInfo: stringOrNull(body.referrerPaymentInfo),
      status,
      dealDate: stringOrNull(body.dealDate) || new Date().toISOString().slice(0, 10),
      source: stringOrNull(body.source),
      notes: stringOrNull(body.notes),
      updatedAt: new Date().toISOString(),
    },
    agents: payloadAgents,
  };
}

export async function GET(req: NextRequest) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const status = req.nextUrl.searchParams.get("status");
  const agentId = req.nextUrl.searchParams.get("agentId");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const parsedAgentId = agentId ? parseInt(agentId, 10) : null;

  const visibilityFilter = dealsVisibleToSql(authResult.session);
  const [dealRows, buildingRows, agentRows, dealAgentRows, invoiceRows] = await Promise.all([
    visibilityFilter
      ? db.select().from(deals).where(visibilityFilter).orderBy(desc(deals.dealDate), desc(deals.createdAt))
      : db.select().from(deals).orderBy(desc(deals.dealDate), desc(deals.createdAt)),
    db.select().from(buildings),
    db.select().from(agents),
    db.select().from(dealAgents),
    db.select().from(invoices),
  ]);

  const buildingById = new Map(buildingRows.map((building) => [building.id, building]));
  const agentById = new Map(agentRows.map((agent) => [agent.id, agent]));
  const invoiceCountByDeal = invoiceRows.reduce<Record<number, number>>((acc, invoice) => {
    if (invoice.dealId) acc[invoice.dealId] = (acc[invoice.dealId] || 0) + 1;
    return acc;
  }, {});
  const invoicesByDeal = new Map<number, typeof invoiceRows>();
  for (const invoice of invoiceRows) {
    if (!invoice.dealId) continue;
    const rows = invoicesByDeal.get(invoice.dealId) || [];
    rows.push(invoice);
    invoicesByDeal.set(invoice.dealId, rows);
  }
  const dealAgentsByDeal = new Map<number, typeof dealAgentRows>();
  for (const row of dealAgentRows) {
    const rows = dealAgentsByDeal.get(row.dealId) || [];
    rows.push(row);
    dealAgentsByDeal.set(row.dealId, rows);
  }

  const filtered = dealRows.filter((deal) => {
    const participantRows = dealAgentsByDeal.get(deal.id) || [];
    const date = getDealDate(deal).slice(0, 10);
    if (status && status !== "all" && deal.status !== status) return false;
    if (
      parsedAgentId &&
      Number.isFinite(parsedAgentId) &&
      !participantRows.some((row) => row.agentId === parsedAgentId)
    ) {
      return false;
    }
    if (from && date && date < from) return false;
    if (to && date && date > to) return false;
    return true;
  });

  return NextResponse.json(
    filtered.map((deal) => {
      const participantRows = dealAgentsByDeal.get(deal.id) || [];
      const participants = participantRows.map((row) => ({
        ...row,
        agent: agentById.get(row.agentId) || null,
      }));
      const primary = participants.find((row) => row.isPrimary);
      return {
        deal,
        building: buildingById.get(deal.buildingId) || null,
        agents: participants,
        primaryAgent: primary?.agent || null,
        invoiceCount: invoiceCountByDeal[deal.id] || 0,
        invoiceSummary: summarizeInvoicePayment(invoicesByDeal.get(deal.id) || []),
      };
    })
  );
}

export async function POST(req: NextRequest) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  try {
    const body = await req.json();
    const result = await cleanDealPayload(body, authResult.session);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    const now = new Date().toISOString();
    const batchResult = await db.batch([
      db.insert(deals).values({ ...result.data, createdAt: now }).returning(),
      ...result.agents.map((agent) =>
        db.insert(dealAgents).values({
          dealId: sql`(SELECT id FROM rental_deals ORDER BY id DESC LIMIT 1)`,
          agentId: agent.agentId,
          sharePct: agent.sharePct,
          isPrimary: agent.isPrimary,
          createdAt: now,
        })
      ),
    ]);

    const createdRows = batchResult[0] as (typeof deals.$inferSelect)[];
    return NextResponse.json(createdRows[0], { status: 201 });
  } catch {
    return NextResponse.json({ error: "Deal creation failed" }, { status: 500 });
  }
}
