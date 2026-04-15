import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, buildings, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateInvoicePDF } from "@/lib/pdf-generator";
import { sendInvoiceEmail } from "@/lib/email-sender";

export async function POST(
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

  if (!building.contactEmail) {
    return NextResponse.json(
      { error: "Building has no contact email configured. Please update the building settings first." },
      { status: 400 }
    );
  }

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

  try {
    const to = building.contactEmail.split(",").map((e) => e.trim());

    await sendInvoiceEmail({
      to,
      replyTo: invoice.agentEmail || undefined,
      subject: invoice.emailSubject || invoice.invoiceNumber,
      fileName: invoice.fileName,
      pdfBuffer,
      buildingName: building.name,
      unit: invoice.unit,
      tenantName: invoice.tenantName,
    });

    await db
      .update(invoices)
      .set({
        status: "sent",
        sentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(invoices.id, Number(id)));

    return NextResponse.json({ success: true, message: "Invoice sent successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db
      .update(invoices)
      .set({ status: "failed", updatedAt: new Date().toISOString() })
      .where(eq(invoices.id, Number(id)));

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
