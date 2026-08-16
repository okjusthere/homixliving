import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { dealCompensationSnapshots } from "@/db/schema";
import { requireAdminApi } from "@/lib/auth-guards";
import {
  recordCompensationReceipt,
  removeCompensationReceipt,
} from "@/lib/compensation-ledger";
import { logAudit } from "@/lib/audit";

async function currentSnapshot(type: string, id: string) {
  const dealId = Number(id);
  if ((type !== "rental" && type !== "sale") || !Number.isInteger(dealId) || dealId <= 0) {
    return null;
  }
  const [snapshot] = await db
    .select()
    .from(dealCompensationSnapshots)
    .where(and(
      eq(dealCompensationSnapshots.dealType, type),
      eq(dealCompensationSnapshots.dealId, dealId),
      eq(dealCompensationSnapshots.status, "finalized"),
      isNull(dealCompensationSnapshots.supersededAt),
    ))
    .limit(1);
  return snapshot || null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { type, id } = await params;
  const snapshot = await currentSnapshot(type, id);
  if (!snapshot) {
    return NextResponse.json({ error: "Finalize compensation before recording receipt." }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const amountCents = Math.round(Number(body.amountCents ?? snapshot.grossCommission * 100));
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "Receipt amount must be positive." }, { status: 400 });
  }
  const receivedAt = typeof body.receivedAt === "string" && !Number.isNaN(Date.parse(body.receivedAt))
    ? new Date(body.receivedAt).toISOString()
    : new Date().toISOString();
  const receipt = await db.transaction((tx) => recordCompensationReceipt(tx, {
    snapshotId: snapshot.id,
    amountCents,
    receivedAt,
    method: String(body.method || "other").slice(0, 40),
    reference: String(body.reference || "").trim().slice(0, 120) || null,
    createdByEmail: auth.session.user.email || null,
  }));
  await logAudit(
    auth.session,
    "mark_received",
    "deal_compensation",
    `${type}:${id}`,
    `公司确认收到佣金 $${(amountCents / 100).toFixed(2)}`,
  );
  return NextResponse.json(receipt);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { type, id } = await params;
  const snapshot = await currentSnapshot(type, id);
  if (!snapshot) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  const removed = await db.transaction((tx) => removeCompensationReceipt(tx, snapshot.id));
  if (!removed) {
    return NextResponse.json(
      { error: "This receipt cannot be removed after a payout has been applied." },
      { status: 409 },
    );
  }
  await logAudit(auth.session, "unmark_received", "deal_compensation", `${type}:${id}`, "取消公司已收佣金");
  return NextResponse.json({ success: true });
}
