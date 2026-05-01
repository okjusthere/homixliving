import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, buildings, dealInvoices, deals, referrers } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getDealDate } from "@/lib/reporting";

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

async function cleanDealPayload(body: Record<string, unknown>) {
  const buildingId = parseId(body.buildingId);
  const primaryAgentId = parseId(body.primaryAgentId);
  const coAgentId = body.coAgentId ? parseId(body.coAgentId) : null;
  const referrerId = body.referrerId ? parseId(body.referrerId) : null;
  const totalCommission = parseNumber(body.totalCommission);
  const primaryAgentSharePct = parseNumber(body.primaryAgentSharePct);
  const coAgentSharePct = parseNumber(body.coAgentSharePct);

  if (!buildingId || !stringOrNull(body.unit) || !stringOrNull(body.tenantName) || totalCommission === null || !primaryAgentId) {
    return { error: "buildingId, unit, tenantName, totalCommission, and primaryAgentId are required" };
  }

  const building = await db.select().from(buildings).where(eq(buildings.id, buildingId)).get();
  if (!building) return { error: "Building not found", status: 404 };

  const primaryAgent = await db.select().from(agents).where(eq(agents.id, primaryAgentId)).get();
  if (!primaryAgent) return { error: "Primary agent not found", status: 404 };

  if (coAgentId) {
    const coAgent = await db.select().from(agents).where(eq(agents.id, coAgentId)).get();
    if (!coAgent) return { error: "Co-agent not found", status: 404 };
    if (coAgentId === primaryAgentId) {
      return { error: "Co-agent must be different from primary agent" };
    }
  }

  if (referrerId) {
    const referrer = await db.select().from(referrers).where(eq(referrers.id, referrerId)).get();
    if (!referrer) return { error: "Referrer not found", status: 404 };
  }

  const primaryShare = coAgentId ? primaryAgentSharePct : primaryAgentSharePct ?? 100;
  const coShare = coAgentId ? coAgentSharePct : null;
  if (coAgentId && (primaryShare === null || coShare === null || Math.abs(primaryShare + coShare - 100) > 0.01)) {
    return { error: "Primary and co-agent shares must sum to 100" };
  }

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
      primaryAgentId,
      primaryAgentSharePct: primaryShare ?? 100,
      coAgentId,
      coAgentSharePct: coShare,
      referrerId,
      referrerType,
      referrerAmount: parseNumber(body.referrerAmount),
      status,
      dealDate: stringOrNull(body.dealDate) || new Date().toISOString().slice(0, 10),
      source: stringOrNull(body.source),
      notes: stringOrNull(body.notes),
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const agentId = req.nextUrl.searchParams.get("agentId");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const parsedAgentId = agentId ? parseInt(agentId, 10) : null;

  const [dealRows, buildingRows, agentRows, referrerRows, linkRows] = await Promise.all([
    db.select().from(deals).orderBy(desc(deals.dealDate), desc(deals.createdAt)),
    db.select().from(buildings),
    db.select().from(agents),
    db.select().from(referrers),
    db.select().from(dealInvoices),
  ]);

  const buildingById = new Map(buildingRows.map((building) => [building.id, building]));
  const agentById = new Map(agentRows.map((agent) => [agent.id, agent]));
  const referrerById = new Map(referrerRows.map((referrer) => [referrer.id, referrer]));
  const invoiceCountByDeal = linkRows.reduce<Record<number, number>>((acc, link) => {
    acc[link.dealId] = (acc[link.dealId] || 0) + 1;
    return acc;
  }, {});

  const filtered = dealRows.filter((deal) => {
    const date = getDealDate(deal).slice(0, 10);
    if (status && status !== "all" && deal.status !== status) return false;
    if (
      parsedAgentId &&
      Number.isFinite(parsedAgentId) &&
      deal.primaryAgentId !== parsedAgentId &&
      deal.coAgentId !== parsedAgentId
    ) {
      return false;
    }
    if (from && date && date < from) return false;
    if (to && date && date > to) return false;
    return true;
  });

  return NextResponse.json(
    filtered.map((deal) => ({
      deal,
      building: buildingById.get(deal.buildingId) || null,
      primaryAgent: agentById.get(deal.primaryAgentId) || null,
      coAgent: deal.coAgentId ? agentById.get(deal.coAgentId) || null : null,
      referrer: deal.referrerId ? referrerById.get(deal.referrerId) || null : null,
      invoiceCount: invoiceCountByDeal[deal.id] || 0,
    }))
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await cleanDealPayload(body);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }
    const [created] = await db
      .insert(deals)
      .values({ ...result.data, createdAt: new Date().toISOString() })
      .returning();
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Deal creation failed" }, { status: 500 });
  }
}
