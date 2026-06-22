import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, buildings, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateInvoicePDF } from "@/lib/pdf-generator";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canViewDeal } from "@/lib/visibility";
import { invoiceSettingsForDocument } from "@/lib/invoice-settings";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const result = await db
    .select({ invoice: invoices, building: buildings })
    .from(invoices)
    .leftJoin(buildings, eq(invoices.buildingId, buildings.id))
    .where(eq(invoices.id, Number(id)))
    .get();

  if (!result || !result.building) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const { invoice, building } = result;
  if (invoice.dealId && !(await canViewDeal(authResult.session, invoice.dealId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (
    !invoice.dealId &&
    !authResult.session.user.isAdmin &&
    invoice.agentEmail?.toLowerCase() !== authResult.session.user.email?.toLowerCase()
  ) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const allSettings = await db.select().from(settings);
  const settingsMap = Object.fromEntries(allSettings.map((s) => [s.key, s.value]));
  const docSettings = invoiceSettingsForDocument(settingsMap);

  const lineItems = typeof invoice.lineItems === "string"
    ? JSON.parse(invoice.lineItems)
    : invoice.lineItems || [];

  const pdfBuffer = await generateInvoicePDF({
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.createdAt || new Date().toISOString().split("T")[0],
    building,
    unit: invoice.unit,
    tenantName: invoice.tenantName,
    licensedCompany: invoice.licensedCompany,
    agentName: invoice.agentName || undefined,
    agentPhone: invoice.agentPhone || undefined,
    agentEmail: invoice.agentEmail || undefined,
    apartmentAddress: invoice.apartmentAddress || undefined,
    moveInDate: invoice.moveInDate || undefined,
    lineItems,
    totalAmount: invoice.totalAmount,
    notes: invoice.notes || undefined,
    ...docSettings,
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.fileName}.pdf"`,
    },
  });
}
