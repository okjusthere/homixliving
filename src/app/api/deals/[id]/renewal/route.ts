import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq } from "drizzle-orm";

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
  const { id } = await params;
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

  const deal = await db.select().from(deals).where(eq(deals.id, Number(id))).get();
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
    .where(eq(deals.id, Number(id)));

  return NextResponse.json({ success: true });
}
