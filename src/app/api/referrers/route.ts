import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals, referrers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { activeDeal } from "@/lib/reporting";

function parseId(value: unknown) {
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function referrerCut(deal: { totalCommission: number; referrerType: string | null; referrerAmount: number | null }) {
  if (deal.referrerType === "percent") {
    return Number(deal.totalCommission || 0) * (Number(deal.referrerAmount || 0) / 100);
  }
  if (deal.referrerType === "flat") {
    return Number(deal.referrerAmount || 0);
  }
  return 0;
}

function cleanReferrerPayload(body: Record<string, unknown>) {
  const defaultReferralType =
    body.defaultReferralType === "percent" || body.defaultReferralType === "flat"
      ? body.defaultReferralType
      : null;
  const amount = body.defaultReferralAmount === "" || body.defaultReferralAmount === null
    ? null
    : Number(body.defaultReferralAmount);
  return {
    name: String(body.name || "").trim(),
    email: body.email ? String(body.email).trim() : null,
    phone: body.phone ? String(body.phone).trim() : null,
    defaultReferralType,
    defaultReferralAmount: Number.isFinite(amount) ? amount : null,
    notes: body.notes ? String(body.notes) : null,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const [referrerRows, dealRows] = await Promise.all([
    db.select().from(referrers).orderBy(referrers.name),
    db.select().from(deals),
  ]);
  const result = referrerRows.map((referrer) => {
    const referredDeals = dealRows.filter(
      (deal) => activeDeal(deal) && deal.referrerId === referrer.id
    );
    return {
      referrer,
      dealsCount: referredDeals.length,
      totalEarned: referredDeals.reduce((sum, deal) => sum + referrerCut(deal), 0),
    };
  });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = cleanReferrerPayload(body);
    if (!data.name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const [created] = await db
      .insert(referrers)
      .values({ ...data, createdAt: new Date().toISOString() })
      .returning();
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Referrer creation failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const id = parseId(body.id);
    if (!id) return NextResponse.json({ error: "Valid referrer id is required" }, { status: 400 });
    const data = cleanReferrerPayload(body);
    if (!data.name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const [updated] = await db.update(referrers).set(data).where(eq(referrers.id, id)).returning();
    if (!updated) return NextResponse.json({ error: "Referrer not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Referrer update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    const parsedId = parseId(id);
    if (!parsedId) {
      return NextResponse.json({ error: "Valid referrer id is required" }, { status: 400 });
    }
    await db
      .update(deals)
      .set({ referrerId: null, referrerType: null, referrerAmount: null, updatedAt: new Date().toISOString() })
      .where(eq(deals.referrerId, parsedId));
    await db.delete(referrers).where(eq(referrers.id, parsedId));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Referrer delete failed" }, { status: 500 });
  }
}
