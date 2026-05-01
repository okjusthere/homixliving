import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, deals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { computeCommission } from "@/lib/commission";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsedId = parseInt(id, 10);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "Valid deal id is required" }, { status: 400 });
  }
  const deal = await db.select().from(deals).where(eq(deals.id, parsedId)).get();
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  const primaryAgent = await db.select().from(agents).where(eq(agents.id, deal.primaryAgentId)).get();
  const coAgent = deal.coAgentId
    ? await db.select().from(agents).where(eq(agents.id, deal.coAgentId)).get()
    : null;
  if (!primaryAgent) {
    return NextResponse.json({ error: "Primary agent not found" }, { status: 404 });
  }

  return NextResponse.json(
    computeCommission({
      totalCommission: Number(deal.totalCommission || 0),
      referrer:
        deal.referrerType === "percent" || deal.referrerType === "flat"
          ? { type: deal.referrerType, amount: Number(deal.referrerAmount || 0) }
          : null,
      primaryAgentSharePct: Number(deal.primaryAgentSharePct || 100),
      primaryAgentSplitPct: Number(primaryAgent.splitPct || 0),
      coAgent: deal.coAgentId
        ? { sharePct: Number(deal.coAgentSharePct || 0), splitPct: Number(coAgent?.splitPct || 0) }
        : null,
    })
  );
}
