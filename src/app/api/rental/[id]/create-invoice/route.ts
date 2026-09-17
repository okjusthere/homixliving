import { NextRequest, NextResponse } from "next/server";
import { businessToday, dbDatePart } from "@/lib/db-time";
import { db } from "@/db";
import { agents, buildings, dealAgents, deals, invoices, type LineItem } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { generateEmailSubject, generateFileName, generateInvoiceNumber } from "@/lib/invoice-generator";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canEditDeal } from "@/lib/visibility";
import { logAudit } from "@/lib/audit";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const parsedId = Number(id);
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(parsedId) || parsedId <= 0 || parsedId > 2147483647) {
    return NextResponse.json({ error: "Valid deal id is required" }, { status: 400 });
  }

  if (!(await canEditDeal(authResult.session, parsedId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const result = await db.transaction(async (tx) => {
    // Lock the rental even when no invoice exists yet. Two tabs/retries must
    // serialize the check + insert; checking outside this transaction races.
    const [deal] = await tx.select().from(deals).where(eq(deals.id, parsedId)).for("update");
    if (!deal) return { error: "Deal not found", status: 404 as const };

    const [existing] = await tx.select().from(invoices)
      .where(eq(invoices.dealId, deal.id)).orderBy(asc(invoices.id)).limit(1);
    // Draft, sent, failed, and paid are all existing invoices. Sending again
    // or handling a cancelled rental must never create a second receivable.
    if (existing) return { invoice: existing, created: false as const };
    if (deal.status === "cancelled") {
      return {
        error: "Cannot generate an invoice for a cancelled deal. Change the deal status first if it closed.",
        status: 409 as const,
      };
    }

    const [building, primaryRow] = await Promise.all([
      tx.select().from(buildings).where(eq(buildings.id, deal.buildingId)).then((rows) => rows[0]),
      tx.select({ agent: agents }).from(dealAgents)
        .innerJoin(agents, eq(agents.id, dealAgents.agentId))
        .where(and(eq(dealAgents.dealId, deal.id), eq(dealAgents.isPrimary, true)))
        .then((rows) => rows[0]),
    ]);
    if (!building) return { error: "Building not found", status: 404 as const };
    if (!primaryRow) return { error: "Primary agent not found", status: 404 as const };

    const primaryAgent = primaryRow.agent;
    const lineItems: LineItem[] = [{
      description: "Owner Pays Commission",
      quantity: 1,
      unitPrice: Number(deal.totalCommission || 0),
      amount: Number(deal.totalCommission || 0),
    }];
    const year = Number((dbDatePart(deal.dealDate) || businessToday()).slice(0, 4));
    const now = new Date().toISOString();
    const [invoice] = await tx.insert(invoices).values({
      buildingId: deal.buildingId,
      dealId: deal.id,
      invoiceNumber: generateInvoiceNumber(deal.unit, building, year),
      fileName: generateFileName(deal.unit, building, deal.licensedCompany),
      emailSubject: generateEmailSubject(deal.unit, building, deal.licensedCompany),
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
    }).returning();
    return { invoice, created: true as const, buildingName: building.name };
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { invoice } = result;
  if (result.created) {
    await logAudit(
      authResult.session, "create", "invoice", invoice.id,
      `从租赁成交 #${parsedId} 生成发票 ${invoice.invoiceNumber} · ${result.buildingName} ${invoice.unit} · $${Number(invoice.totalAmount).toLocaleString("en-US")}`
    );
  }
  return NextResponse.json({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, reused: !result.created });
}
