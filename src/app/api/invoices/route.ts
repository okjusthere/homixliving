import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals, invoices, buildings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { generateInvoiceNumber, generateFileName, generateEmailSubject } from "@/lib/invoice-generator";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { dealsVisibleToSql } from "@/lib/visibility";

export async function GET() {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const allInvoices = await db
    .select({
      invoice: invoices,
      buildingName: buildings.name,
      buildingRegion: buildings.region,
    })
    .from(invoices)
    .leftJoin(buildings, eq(invoices.buildingId, buildings.id))
    .orderBy(desc(invoices.createdAt));

  if (authResult.session.user.isAdmin) {
    return NextResponse.json(allInvoices);
  }

  const visibilityFilter = dealsVisibleToSql(authResult.session);
  const visibleDeals = visibilityFilter
    ? await db.select({ id: deals.id }).from(deals).where(visibilityFilter)
    : await db.select({ id: deals.id }).from(deals);
  const visibleDealIds = new Set(visibleDeals.map((deal) => deal.id));
  return NextResponse.json(
    allInvoices.filter(({ invoice }) => {
      if (invoice.dealId) return visibleDealIds.has(invoice.dealId);
      return invoice.agentEmail?.toLowerCase() === authResult.session.user.email?.toLowerCase();
    })
  );
}

export async function POST(req: NextRequest) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const body = await req.json();
  const { buildingId, unit, tenantName, agentEmail, agentName, agentPhone, apartmentAddress, moveInDate, licensedCompany, year, lineItems, totalAmount, notes } = body;

  const building = await db.select().from(buildings).where(eq(buildings.id, buildingId)).get();
  if (!building) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  const invoiceNumber = generateInvoiceNumber(unit, building, year || 2026);
  const fileName = generateFileName(unit, building, licensedCompany);
  const emailSubject = generateEmailSubject(unit, building, licensedCompany);

  const result = await db.insert(invoices).values({
    buildingId,
    invoiceNumber,
    fileName,
    emailSubject,
    unit,
    tenantName,
    agentEmail,
    agentName,
    agentPhone,
    apartmentAddress,
    moveInDate,
    licensedCompany,
    year: year || 2026,
    lineItems,
    totalAmount,
    notes,
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).returning();

  return NextResponse.json(result[0], { status: 201 });
}
