import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { dealAgents, invoices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminApi } from "@/lib/auth-guards";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const invoice = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, Number(id)))
    .get();

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  // Validate paidAt: reject non-date strings (e.g. "banana") rather than
  // persisting them; default to now when omitted.
  let paidAt = new Date().toISOString();
  if (typeof body.paidAt === "string" && body.paidAt.trim()) {
    const parsed = new Date(body.paidAt);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid paidAt date." }, { status: 400 });
    }
    paidAt = parsed.toISOString();
  }

  // Validate paidAmount: reject NaN/negative/non-finite; default to the invoice total.
  let paidAmount = invoice.totalAmount;
  if (body.paidAmount !== undefined && body.paidAmount !== null) {
    const amount = Number(body.paidAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "Invalid paidAmount." }, { status: 400 });
    }
    paidAmount = amount;
  }

  await db
    .update(invoices)
    .set({
      status: "paid",
      paidAt,
      paidAmount,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(invoices.id, Number(id)));

  await logAudit(
    authResult.session,
    "mark_paid",
    "invoice",
    invoice.id,
    `发票 ${invoice.invoiceNumber} 标记已收款 $${Number(paidAmount || 0).toLocaleString("en-US")}`,
    { paidAt, paidAmount }
  );

  // In-app heads-up for the agents on the deal — their commission cleared.
  if (invoice.dealId) {
    try {
      const participants = await db
        .select({ agentId: dealAgents.agentId })
        .from(dealAgents)
        .where(eq(dealAgents.dealId, invoice.dealId));
      await notify({
        recipientAgentIds: participants.map((p) => p.agentId),
        type: "invoice_paid",
        title: `发票已收款：${invoice.invoiceNumber}`,
        body: `${invoice.tenantName} · $${Number(paidAmount || 0).toLocaleString("en-US")}`,
        href: `/invoices/${invoice.id}`,
        dedupeKey: `invoice-paid:${invoice.id}:${paidAt}`,
      });
    } catch (error) {
      console.error("invoice_paid notification failed", error);
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  // Undo "mark as paid" — revert to sent
  const { id } = await params;
  const invoice = await db.select().from(invoices).where(eq(invoices.id, Number(id))).get();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  await db
    .update(invoices)
    .set({
      status: "sent",
      paidAt: null,
      paidAmount: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(invoices.id, Number(id)));
  await logAudit(
    authResult.session,
    "unmark_paid",
    "invoice",
    invoice.id,
    `发票 ${invoice.invoiceNumber} 取消已收款标记`
  );
  return NextResponse.json({ success: true });
}
