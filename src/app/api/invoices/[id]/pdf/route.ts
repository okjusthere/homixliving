import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, buildings, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateInvoicePDF } from "@/lib/pdf-generator";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const allSettings = await db.select().from(settings);
  const settingsMap = Object.fromEntries(allSettings.map((s) => [s.key, s.value]));

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
    lineItems,
    totalAmount: invoice.totalAmount,
    notes: invoice.notes || undefined,
    companyName: settingsMap.company_name || "Homix Living",
    companyAddress: settingsMap.company_address || "",
  });

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.fileName}.pdf"`,
    },
  });
}
