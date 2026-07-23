import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoiceSendLog, invoices, buildings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canViewDeal, canEditDeal } from "@/lib/visibility";
import { logAudit } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const result = await db
    .select({
      invoice: invoices,
      building: buildings,
    })
    .from(invoices)
    .leftJoin(buildings, eq(invoices.buildingId, buildings.id))
    .where(eq(invoices.id, Number(id)))
    .then((rows) => rows[0]);

  if (!result) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (
    result.invoice.dealId &&
    !(await canViewDeal(authResult.session, result.invoice.dealId))
  ) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (
    !result.invoice.dealId &&
    !authResult.session.user.isAdmin &&
    result.invoice.agentEmail?.toLowerCase() !== authResult.session.user.email?.toLowerCase()
  ) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Every send attempt, success or failure — invoices.status only remembers
  // the latest one, so "did this actually go out?" is answered here.
  const sendLog = await db
    .select()
    .from(invoiceSendLog)
    .where(eq(invoiceSendLog.invoiceId, Number(id)))
    .orderBy(desc(invoiceSendLog.id))
    .limit(50);

  return NextResponse.json({ ...result, sendLog });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const invoice = await db.select().from(invoices).where(eq(invoices.id, Number(id))).then((rows) => rows[0]);
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  // Deleting a financial record requires EDIT rights, not just view — team-leader
  // read access must not grant deletion of a team member's invoice.
  if (invoice.dealId && !(await canEditDeal(authResult.session, invoice.dealId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (
    !invoice.dealId &&
    !authResult.session.user.isAdmin &&
    invoice.agentEmail?.toLowerCase() !== authResult.session.user.email?.toLowerCase()
  ) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  await db.delete(invoices).where(eq(invoices.id, Number(id)));
  await logAudit(
    authResult.session,
    "delete",
    "invoice",
    invoice.id,
    `删除发票 ${invoice.invoiceNumber} · $${Number(invoice.totalAmount || 0).toLocaleString("en-US")}`,
    invoice
  );
  return NextResponse.json({ success: true });
}
