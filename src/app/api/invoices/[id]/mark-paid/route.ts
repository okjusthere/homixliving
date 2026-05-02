import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canViewDeal } from "@/lib/visibility";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireActiveAgentApi();
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

  const paidAt: string =
    typeof body.paidAt === "string" && body.paidAt
      ? body.paidAt
      : new Date().toISOString();

  const paidAmount: number =
    typeof body.paidAmount === "number" && !isNaN(body.paidAmount)
      ? body.paidAmount
      : invoice.totalAmount;

  await db
    .update(invoices)
    .set({
      status: "paid",
      paidAt,
      paidAmount,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(invoices.id, Number(id)));

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  // Undo "mark as paid" — revert to sent
  const { id } = await params;
  const invoice = await db.select().from(invoices).where(eq(invoices.id, Number(id))).get();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
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
  await db
    .update(invoices)
    .set({
      status: "sent",
      paidAt: null,
      paidAmount: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(invoices.id, Number(id)));
  return NextResponse.json({ success: true });
}
