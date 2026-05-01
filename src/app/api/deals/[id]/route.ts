import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, buildings, dealInvoices, deals, invoices, referrers } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

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

async function serializeDeal(id: number) {
  const deal = await db.select().from(deals).where(eq(deals.id, id)).get();
  if (!deal) return null;
  const [building, primaryAgent, coAgent, referrer, links] = await Promise.all([
    db.select().from(buildings).where(eq(buildings.id, deal.buildingId)).get(),
    db.select().from(agents).where(eq(agents.id, deal.primaryAgentId)).get(),
    deal.coAgentId ? db.select().from(agents).where(eq(agents.id, deal.coAgentId)).get() : null,
    deal.referrerId ? db.select().from(referrers).where(eq(referrers.id, deal.referrerId)).get() : null,
    db.select().from(dealInvoices).where(eq(dealInvoices.dealId, deal.id)),
  ]);
  const invoiceIds = links.map((link) => link.invoiceId);
  const linkedInvoices =
    invoiceIds.length > 0
      ? await db.select().from(invoices).where(inArray(invoices.id, invoiceIds))
      : [];
  return { deal, building, primaryAgent, coAgent, referrer, linkedInvoices };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsedId = parseId(id);
  if (!parsedId) return NextResponse.json({ error: "Valid deal id is required" }, { status: 400 });
  const result = await serializeDeal(parsedId);
  if (!result) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  return NextResponse.json(result);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsedId = parseId(id);
  if (!parsedId) return NextResponse.json({ error: "Valid deal id is required" }, { status: 400 });

  try {
    const body = await req.json();
    const existing = await db.select().from(deals).where(eq(deals.id, parsedId)).get();
    if (!existing) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    const buildingId = parseId(body.buildingId) || existing.buildingId;
    const primaryAgentId = parseId(body.primaryAgentId) || existing.primaryAgentId;
    const coAgentId = body.coAgentId ? parseId(body.coAgentId) : null;
    const totalCommission = parseNumber(body.totalCommission) ?? existing.totalCommission;
    const primaryAgentSharePct = parseNumber(body.primaryAgentSharePct) ?? existing.primaryAgentSharePct;
    const coAgentSharePct = body.coAgentSharePct === "" ? null : parseNumber(body.coAgentSharePct);

    const primaryAgent = await db.select().from(agents).where(eq(agents.id, primaryAgentId)).get();
    if (!primaryAgent) return NextResponse.json({ error: "Primary agent not found" }, { status: 404 });
    if (coAgentId && Math.abs(primaryAgentSharePct + Number(coAgentSharePct || 0) - 100) > 0.01) {
      return NextResponse.json({ error: "Primary and co-agent shares must sum to 100" }, { status: 400 });
    }

    const status = stringOrNull(body.status) || existing.status;
    if (!["active", "cancelled", "completed"].includes(status)) {
      return NextResponse.json({ error: "Status must be active, cancelled, or completed" }, { status: 400 });
    }

    const [updated] = await db
      .update(deals)
      .set({
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
        licensedCompany: stringOrNull(body.licensedCompany) || existing.licensedCompany || primaryAgent.licensedCompany || "Homix Living Inc.",
        primaryAgentId,
        primaryAgentSharePct: coAgentId ? primaryAgentSharePct : 100,
        coAgentId,
        coAgentSharePct: coAgentId ? coAgentSharePct : null,
        referrerId: body.referrerId ? parseId(body.referrerId) : null,
        referrerType: stringOrNull(body.referrerType),
        referrerAmount: parseNumber(body.referrerAmount),
        status,
        dealDate: stringOrNull(body.dealDate) || existing.dealDate,
        notes: stringOrNull(body.notes),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(deals.id, parsedId))
      .returning();
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Deal update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsedId = parseId(id);
  if (!parsedId) return NextResponse.json({ error: "Valid deal id is required" }, { status: 400 });
  await db.update(invoices).set({ dealId: null, updatedAt: new Date().toISOString() }).where(eq(invoices.dealId, parsedId));
  await db.delete(dealInvoices).where(eq(dealInvoices.dealId, parsedId));
  await db.delete(deals).where(eq(deals.id, parsedId));
  return NextResponse.json({ success: true });
}
