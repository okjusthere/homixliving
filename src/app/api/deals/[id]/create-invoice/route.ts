import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, buildings, dealInvoices, deals, invoices, type LineItem } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateEmailSubject, generateFileName, generateInvoiceNumber } from "@/lib/invoice-generator";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsedId = parseInt(id, 10);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "Valid deal id is required" }, { status: 400 });
  }

  const deal = await db.select().from(deals).where(eq(deals.id, parsedId)).get();
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  // Guard: cancelled deals cannot generate invoices. This protects against
  // accidentally billing a building for a deal that fell through.
  if (deal.status === "cancelled") {
    return NextResponse.json(
      {
        error:
          "无法为已取消的 deal 生成 invoice。如果该 deal 实际上已成交，请先把状态改回 active 或 completed。",
      },
      { status: 409 }
    );
  }

  const [building, primaryAgent] = await Promise.all([
    db.select().from(buildings).where(eq(buildings.id, deal.buildingId)).get(),
    db.select().from(agents).where(eq(agents.id, deal.primaryAgentId)).get(),
  ]);
  if (!building) return NextResponse.json({ error: "Building not found" }, { status: 404 });
  if (!primaryAgent) return NextResponse.json({ error: "Primary agent not found" }, { status: 404 });

  const lineItems: LineItem[] = [
    {
      description: "Owner Pays Commission",
      quantity: 1,
      unitPrice: Number(deal.totalCommission || 0),
      amount: Number(deal.totalCommission || 0),
    },
  ];
  const yearSource = deal.dealDate || new Date().toISOString();
  const year = Number.isFinite(new Date(yearSource).getFullYear())
    ? new Date(yearSource).getFullYear()
    : new Date().getFullYear();
  const invoiceNumber = generateInvoiceNumber(deal.unit, building, year);
  const fileName = generateFileName(deal.unit, building, deal.licensedCompany);
  const emailSubject = generateEmailSubject(deal.unit, building, deal.licensedCompany);
  const now = new Date().toISOString();

  const [invoice] = await db
    .insert(invoices)
    .values({
      buildingId: deal.buildingId,
      dealId: deal.id,
      invoiceNumber,
      fileName,
      emailSubject,
      unit: deal.unit,
      tenantName: deal.tenantName,
      agentEmail: primaryAgent.email,
      agentName: primaryAgent.name,
      agentPhone: primaryAgent.phone,
      apartmentAddress: deal.apartmentAddress,
      moveInDate: deal.moveInDate,
      licensedCompany: deal.licensedCompany,
      year,
      lineItems,
      totalAmount: Number(deal.totalCommission || 0),
      notes: deal.notes,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await db
    .insert(dealInvoices)
    .values({ dealId: deal.id, invoiceId: invoice.id, createdAt: now })
    .onConflictDoNothing();

  return NextResponse.json({ invoiceId: invoice.id, invoiceNumber });
}
