import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canEditDeal } from "@/lib/visibility";
import { logAudit } from "@/lib/audit";

const VALID_STATUSES = new Set([
  "pending",
  "renewing",
  "moving_out",
  "renewed",
  "lost",
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const dealId = Number(id);
  if (!Number.isFinite(dealId)) {
    return NextResponse.json({ error: "Valid deal id is required" }, { status: 400 });
  }

  if (!(await canEditDeal(authResult.session, dealId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const status: string | null =
    body.renewalStatus === null
      ? null
      : typeof body.renewalStatus === "string"
      ? body.renewalStatus
      : "";

  if (status !== null && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid renewal status" }, { status: 400 });
  }

  const renewedToDealId =
    typeof body.renewedToDealId === "number" ? body.renewedToDealId : null;

  const deal = await db.select().from(deals).where(eq(deals.id, dealId)).get();
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  await db
    .update(deals)
    .set({
      renewalStatus: status,
      renewalNotedAt: new Date().toISOString(),
      renewedToDealId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(deals.id, dealId));

  await logAudit(
    authResult.session,
    "renewal_update",
    "rental_deal",
    dealId,
    `租赁成交 #${dealId} · ${deal.unit} · 租客 ${deal.tenantName} 续租状态更新为 ${status ?? "未设置"}`,
    { renewalStatus: status, renewedToDealId }
  );

  return NextResponse.json({ success: true });
}
