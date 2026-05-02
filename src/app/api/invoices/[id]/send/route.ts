import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, buildings, settings, invoiceSendLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateInvoicePDF } from "@/lib/pdf-generator";
import { sendInvoiceEmail } from "@/lib/email-sender";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canViewDeal } from "@/lib/visibility";

// PDF rendering (@react-pdf/renderer) + Resend round-trip can occasionally
// push past Vercel's default 10-second function limit, especially on cold
// starts. When that happens the client sees a truncated response body and a
// "Unexpected end of JSON input" toast — even though the email already left.
// Bump the cap so the function gets time to complete and reply with JSON.
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

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
  if (
    invoice.dealId &&
    !(await canViewDeal(authResult.session, invoice.dealId))
  ) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (
    !invoice.dealId &&
    !authResult.session.user.isAdmin &&
    invoice.agentEmail?.toLowerCase() !== authResult.session.user.email?.toLowerCase()
  ) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Allow custom recipients from request body, fallback to building config
  const toEmails: string = body.to || building.contactEmail || "";
  const ccEmails: string = body.cc || "";
  const replyTo: string = body.replyTo || invoice.agentEmail || "";
  const subject: string = body.subject || invoice.emailSubject || invoice.invoiceNumber;

  if (!toEmails.trim()) {
    return NextResponse.json(
      { error: "没有收件人邮箱。请填写收件邮箱后再发送。" },
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
    agentName: invoice.agentName || undefined,
    agentPhone: invoice.agentPhone || undefined,
    agentEmail: invoice.agentEmail || undefined,
    apartmentAddress: invoice.apartmentAddress || undefined,
    moveInDate: invoice.moveInDate || undefined,
    lineItems,
    totalAmount: invoice.totalAmount,
    notes: invoice.notes || undefined,
    companyName: settingsMap.company_name || "Homix Living",
    companyAddress: settingsMap.company_address || "5 West 37th Street, Floor 2\nNew York, NY 10018",
    fromEmail: settingsMap.from_email || "invoice@homixny.com",
    payableTo: settingsMap.payable_to || undefined,
    taxId: settingsMap.tax_id || undefined,
    mailCheckAddress: settingsMap.mail_check_address || undefined,
    achBankName: settingsMap.ach_bank_name || undefined,
    achRoutingNumber: settingsMap.ach_routing_number || undefined,
    achAccountNumber: settingsMap.ach_account_number || undefined,
    achAccountName: settingsMap.ach_account_name || undefined,
    wireAccountName: settingsMap.wire_account_name || undefined,
    wireBankName: settingsMap.wire_bank_name || undefined,
    wireRoutingNumber: settingsMap.wire_routing_number || undefined,
    wireAccountNumber: settingsMap.wire_account_number || undefined,
    wireBankAddress: settingsMap.wire_bank_address || undefined,
    wireSwiftCode: settingsMap.wire_swift_code || undefined,
  });

  const sentByEmail = authResult.session.user.email || null;

  const to = toEmails.split(",").map((e) => e.trim()).filter(Boolean);
  const extraCc = ccEmails ? ccEmails.split(",").map((e) => e.trim()).filter(Boolean) : [];
  const now = new Date().toISOString();

  try {
    await sendInvoiceEmail({
      to,
      cc: extraCc.length > 0 ? extraCc : undefined,
      replyTo: replyTo || undefined,
      subject,
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
        sentAt: now,
        updatedAt: now,
      })
      .where(eq(invoices.id, Number(id)));

    await db.insert(invoiceSendLog).values({
      invoiceId: Number(id),
      sentByEmail,
      toRecipients: to.join(", "),
      ccRecipients: extraCc.length > 0 ? extraCc.join(", ") : null,
      replyTo: replyTo || null,
      subject,
      status: "sent",
      errorMessage: null,
      sentAt: now,
    });

    return NextResponse.json({ success: true, message: "Invoice sent successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db
      .update(invoices)
      .set({ status: "failed", updatedAt: now })
      .where(eq(invoices.id, Number(id)));

    await db.insert(invoiceSendLog).values({
      invoiceId: Number(id),
      sentByEmail,
      toRecipients: to.join(", "),
      ccRecipients: extraCc.length > 0 ? extraCc.join(", ") : null,
      replyTo: replyTo || null,
      subject,
      status: "failed",
      errorMessage: message,
      sentAt: now,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
