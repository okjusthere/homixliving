import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals, invoices, buildings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { generateInvoiceNumber, generateFileName, generateEmailSubject } from "@/lib/invoice-generator";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { dealsVisibleToSql } from "@/lib/visibility";
import { logAudit } from "@/lib/audit";

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
  const { buildingId, unit, tenantName, agentEmail, agentName, agentPhone, apartmentAddress, moveInDate, licensedCompany, year, lineItems, notes } = body;

  const building = await db.select().from(buildings).where(eq(buildings.id, buildingId)).then((rows) => rows[0]);
  if (!building) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  // Validate line items and compute the authoritative total server-side rather
  // than trusting the client's `totalAmount` (which arrived unvalidated — a
  // string or NaN would land straight in the numeric column, and a total that
  // disagreed with the line items would misstate the receivable).
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });
  }
  let totalAmount = 0;
  for (const item of lineItems) {
    const amount = Number(item?.amount);
    if (!Number.isFinite(amount)) {
      return NextResponse.json({ error: "Each line item needs a numeric amount." }, { status: 400 });
    }
    totalAmount += amount;
  }
  totalAmount = Math.round(totalAmount * 100) / 100;

  // Bind the invoice's agent to the caller for non-admins so an agent can't
  // create an invoice attributed to (and later visible to) a colleague. Admins
  // may set it explicitly (e.g. filing on behalf of an agent).
  const boundAgentEmail = authResult.session.user.isAdmin
    ? agentEmail || authResult.session.user.email || null
    : authResult.session.user.email || null;

  const invoiceYear =
    Number.isInteger(year) && year > 2000 ? year : new Date().getFullYear();
  const invoiceNumber = generateInvoiceNumber(unit, building, invoiceYear);
  const fileName = generateFileName(unit, building, licensedCompany);
  const emailSubject = generateEmailSubject(unit, building, licensedCompany);

  const result = await db.insert(invoices).values({
    buildingId,
    invoiceNumber,
    fileName,
    emailSubject,
    unit,
    tenantName,
    agentEmail: boundAgentEmail,
    agentName,
    agentPhone,
    apartmentAddress,
    moveInDate,
    licensedCompany,
    year: invoiceYear,
    lineItems,
    totalAmount,
    notes,
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).returning();

  await logAudit(
    authResult.session,
    "create",
    "invoice",
    result[0].id,
    `新建发票 ${invoiceNumber} · ${building.name} ${unit || ""} · $${totalAmount.toLocaleString("en-US")}`
  );

  return NextResponse.json(result[0], { status: 201 });
}
