import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, buildings, dealAgents, deals, invoices, type LineItem } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { generateEmailSubject, generateFileName, generateInvoiceNumber } from "@/lib/invoice-generator";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canEditDeal } from "@/lib/visibility";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const parsedId = parseInt(id, 10);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "Valid deal id is required" }, { status: 400 });
  }

  if (!(await canEditDeal(authResult.session, parsedId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const deal = await db.select().from(deals).where(eq(deals.id, parsedId)).get();
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  if (deal.status === "cancelled") {
    return NextResponse.json(
      {
        error:
          "Cannot generate an invoice for a cancelled deal. Change the deal status first if it closed.",
      },
      { status: 409 }
    );
  }

  const [building, primaryRow] = await Promise.all([
    db.select().from(buildings).where(eq(buildings.id, deal.buildingId)).get(),
    db
      .select({
        dealAgent: dealAgents,
        agent: agents,
      })
      .from(dealAgents)
      .innerJoin(agents, eq(agents.id, dealAgents.agentId))
      .where(and(eq(dealAgents.dealId, deal.id), eq(dealAgents.isPrimary, true)))
      .get(),
  ]);
  if (!building) return NextResponse.json({ error: "Building not found" }, { status: 404 });
  if (!primaryRow) return NextResponse.json({ error: "Primary agent not found" }, { status: 404 });

  const primaryAgent = primaryRow.agent;
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

  return NextResponse.json({ invoiceId: invoice.id, invoiceNumber });
}
