import { businessToday } from "@/lib/db-time";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, buildings, settings, invoiceSendLog } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { InvoiceLifecycleError, lockInvoice } from "@/lib/invoice-lifecycle";
import { generateInvoicePDF } from "@/lib/pdf-generator";
import { sendInvoiceEmail } from "@/lib/email-sender";
import { UncertainInvoiceDeliveryError } from "@/lib/invoice-email-errors";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canViewDeal } from "@/lib/visibility";
import { invoiceSettingsForDocument } from "@/lib/invoice-settings";

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
    .then((rows) => rows[0]);

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

  // Never let a re-send regress a paid invoice. Without this, re-sending flips
  // status back to "sent" (deal shows "Awaiting payment" again), and a Resend
  // error would flip a *paid* invoice to "failed".
  if (invoice.status === "paid") {
    return NextResponse.json(
      { error: "This invoice is already marked paid. Un-mark it as paid before re-sending." },
      { status: 409 }
    );
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
  const docSettings = invoiceSettingsForDocument(settingsMap);

  const lineItems = typeof invoice.lineItems === "string"
    ? JSON.parse(invoice.lineItems)
    : invoice.lineItems || [];

  const sentByEmail = authResult.session.user.email || null;

  const to = toEmails.split(",").map((e) => e.trim()).filter(Boolean);
  const extraCc = ccEmails ? ccEmails.split(",").map((e) => e.trim()).filter(Boolean) : [];
  const now = new Date().toISOString();

  // Reserve before rendering or contacting the mail provider. A draft cannot
  // disappear while an email is in flight, and overlapping sends cannot both start.
  let attemptId: number;
  try {
    attemptId = await db.transaction(async (tx) => {
      const current = await lockInvoice(tx, invoice);
      if (current.status === "paid" || current.paidAt || current.paidAmount !== null) {
        throw new InvoiceLifecycleError("This invoice is already paid / 此发票已收款，不能重新发送");
      }
      const [pending] = await tx.select({ id: invoiceSendLog.id }).from(invoiceSendLog)
        .where(and(eq(invoiceSendLog.invoiceId, invoice.id), eq(invoiceSendLog.status, "sending"))).limit(1);
      if (pending) throw new InvoiceLifecycleError("A send is already in progress. Check delivery history before retrying / 已有发送正在处理，请核实发送历史后再试");
      const [attempt] = await tx.insert(invoiceSendLog).values({
        invoiceId: invoice.id, sentByEmail, toRecipients: to.join(", "),
        ccRecipients: extraCc.length ? extraCc.join(", ") : null,
        replyTo: replyTo || null, subject, status: "sending", sentAt: now,
      }).returning({ id: invoiceSendLog.id });
      return attempt.id;
    });
  } catch (error) {
    if (error instanceof InvoiceLifecycleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  let deliveryConfirmed = false;
  try {
    const pdfBuffer = await generateInvoicePDF({
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.createdAt || businessToday(),
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
    deliveryConfirmed = true;

    await db
      .update(invoices)
      .set({
        // A payment recorded during delivery is authoritative.
        status: sql`CASE WHEN ${invoices.status} = 'paid' OR ${invoices.paidAt} IS NOT NULL OR ${invoices.paidAmount} IS NOT NULL THEN ${invoices.status} ELSE 'sent' END`,
        sentAt: now,
        updatedAt: now,
      })
      .where(eq(invoices.id, Number(id)));

    await db.update(invoiceSendLog).set({ status: "sent", errorMessage: null, sentAt: now })
      .where(eq(invoiceSendLog.id, attemptId));

    return NextResponse.json({ success: true, message: "Invoice sent successfully" });
  } catch (error: unknown) {
    if (error instanceof UncertainInvoiceDeliveryError) {
      return NextResponse.json({ error: "Delivery could not be confirmed. Ask an administrator to check the mail provider before retrying / 暂时无法确认是否发送成功，请管理员核对邮件服务商记录后再操作。" }, { status: 503 });
    }
    if (deliveryConfirmed) {
      console.error("Invoice delivered but delivery history could not be saved", error);
      return NextResponse.json({ error: "Email was sent, but confirmation could not be saved. Ask an administrator to verify the delivery history before retrying / 邮件已发送，但确认记录未保存；请管理员核实发送历史后再操作。" }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    await db
      .update(invoices)
      .set({ status: sql`CASE WHEN ${invoices.status} = 'paid' OR ${invoices.paidAt} IS NOT NULL OR ${invoices.paidAmount} IS NOT NULL THEN ${invoices.status} ELSE 'failed' END`, updatedAt: now })
      .where(eq(invoices.id, Number(id)));

    await db.update(invoiceSendLog).set({ status: "failed", errorMessage: message, sentAt: now })
      .where(eq(invoiceSendLog.id, attemptId));

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
