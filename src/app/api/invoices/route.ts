import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, buildings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { generateInvoiceNumber, generateFileName, generateEmailSubject } from "@/lib/invoice-generator";

export async function GET() {
  const allInvoices = await db
    .select({
      invoice: invoices,
      buildingName: buildings.name,
      buildingRegion: buildings.region,
    })
    .from(invoices)
    .leftJoin(buildings, eq(invoices.buildingId, buildings.id))
    .orderBy(desc(invoices.createdAt));
  return NextResponse.json(allInvoices);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { buildingId, unit, tenantName, agentEmail, agentName, licensedCompany, year, lineItems, totalAmount, notes } = body;

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
    licensedCompany,
    year: year || 2026,
    lineItems: JSON.stringify(lineItems),
    totalAmount,
    notes,
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).returning();

  return NextResponse.json(result[0], { status: 201 });
}
