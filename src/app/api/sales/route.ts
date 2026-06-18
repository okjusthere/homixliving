import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents, saleDealAgents, saleDeals } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { saleDealsVisibleToSql } from "@/lib/visibility";

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

function parseSaleAgents(value: unknown): SaleAgentPayload[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((row) => ({
    agentId: parseId((row as Record<string, unknown>).agentId) || 0,
    sharePct: parseNumber((row as Record<string, unknown>).sharePct) ?? Number.NaN,
    isPrimary: Boolean((row as Record<string, unknown>).isPrimary),
  }));
}

async function cleanSalePayload(
  body: Record<string, unknown>,
  session: { user: { agentId: number | null; isAdmin: boolean } },
) {
  const payloadAgents = parseSaleAgents(body.agents);
  const propertyAddress = stringOrNull(body.propertyAddress);
  const grossCommission = parseNumber(body.grossCommission) ?? 0;
  const representationType = stringOrNull(body.representationType) || "buyer_rep";
  const stage = stringOrNull(body.stage) || "pre_contract";
  const status = stringOrNull(body.status) || "active";

  if (!propertyAddress) {
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
      propertyAddress,
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

export async function GET(req: NextRequest) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const status = req.nextUrl.searchParams.get("status");
  const agentId = req.nextUrl.searchParams.get("agentId");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const parsedAgentId = agentId ? parseInt(agentId, 10) : null;

  const visibilityFilter = saleDealsVisibleToSql(authResult.session);
  const [saleRows, agentRows, saleAgentRows] = await Promise.all([
    visibilityFilter
      ? db
          .select()
          .from(saleDeals)
          .where(visibilityFilter)
          .orderBy(desc(saleDeals.closingDate), desc(saleDeals.createdAt))
      : db.select().from(saleDeals).orderBy(desc(saleDeals.closingDate), desc(saleDeals.createdAt)),
    db.select().from(agents),
    db.select().from(saleDealAgents),
  ]);

  const agentById = new Map(agentRows.map((agent) => [agent.id, agent]));
  const participantsBySale = new Map<number, typeof saleAgentRows>();
  for (const row of saleAgentRows) {
    const rows = participantsBySale.get(row.saleDealId) || [];
    rows.push(row);
    participantsBySale.set(row.saleDealId, rows);
  }

  const filtered = saleRows.filter((saleDeal) => {
    const participantRows = participantsBySale.get(saleDeal.id) || [];
    const date = (saleDeal.closingDate || saleDeal.contractDate || saleDeal.createdAt || "").slice(0, 10);
    if (status && status !== "all" && saleDeal.status !== status) return false;
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
    filtered.map((saleDeal) => {
      const participantRows = participantsBySale.get(saleDeal.id) || [];
      const participants = participantRows.map((row) => ({
        ...row,
        agent: agentById.get(row.agentId) || null,
      }));
      const primary = participants.find((row) => row.isPrimary);
      return {
        saleDeal,
        agents: participants,
        primaryAgent: primary?.agent || null,
      };
    })
  );
}

export async function POST(req: NextRequest) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  try {
    const body = await req.json();
    const result = await cleanSalePayload(body, authResult.session);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    const now = new Date().toISOString();
    const batchResult = await db.batch([
      db.insert(saleDeals).values({ ...result.data, createdAt: now }).returning(),
      ...result.agents.map((agent) =>
        db.insert(saleDealAgents).values({
          saleDealId: sql`(SELECT id FROM sale_deals ORDER BY id DESC LIMIT 1)`,
          agentId: agent.agentId,
          sharePct: agent.sharePct,
          isPrimary: agent.isPrimary,
          createdAt: now,
        })
      ),
    ]);

    const createdRows = batchResult[0] as (typeof saleDeals.$inferSelect)[];
    return NextResponse.json(createdRows[0], { status: 201 });
  } catch {
    return NextResponse.json({ error: "Sale creation failed" }, { status: 500 });
  }
}
