import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  dealAgents,
  dealCompensationAllocations,
  dealCompensationSnapshots,
  deals,
  saleDealAgents,
  saleDeals,
} from "@/db/schema";
import { requireActiveAgentApi, requireAdminApi } from "@/lib/auth-guards";
import { canViewDeal, canViewSaleDeal } from "@/lib/visibility";
import { buildCompensationEstimate, persistCompensationSnapshot } from "@/lib/compensation-service";
import { logAudit } from "@/lib/audit";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function currentSnapshot(dealType: "rental" | "sale", dealId: number) {
  const [snapshot] = await db
    .select()
    .from(dealCompensationSnapshots)
    .where(and(
      eq(dealCompensationSnapshots.dealType, dealType),
      eq(dealCompensationSnapshots.dealId, dealId),
      isNull(dealCompensationSnapshots.supersededAt),
    ))
    .limit(1);
  if (!snapshot) return null;
  const allocations = await db
    .select()
    .from(dealCompensationAllocations)
    .where(eq(dealCompensationAllocations.snapshotId, snapshot.id));
  return { snapshot, allocations };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;
  const { type, id } = await params;
  const dealId = parseId(id);
  if ((type !== "rental" && type !== "sale") || !dealId) {
    return NextResponse.json({ error: "Invalid deal" }, { status: 400 });
  }
  const canView = type === "rental"
    ? await canViewDeal(authResult.session, dealId)
    : await canViewSaleDeal(authResult.session, dealId);
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await currentSnapshot(type, dealId);
  return result
    ? NextResponse.json(result)
    : NextResponse.json({ error: "Compensation estimate not found" }, { status: 404 });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;
  const { type, id } = await params;
  const dealId = parseId(id);
  if ((type !== "rental" && type !== "sale") || !dealId) {
    return NextResponse.json({ error: "Invalid deal" }, { status: 400 });
  }

  const existing = await currentSnapshot(type, dealId);
  if (existing?.snapshot.status === "finalized") {
    return NextResponse.json(existing);
  }

  let effectiveDate: string;
  let result;
  if (type === "rental") {
    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
    if (!deal) return NextResponse.json({ error: "Rental not found" }, { status: 404 });
    const participants = await db.select().from(dealAgents).where(eq(dealAgents.dealId, dealId));
    effectiveDate = deal.dealDate || deal.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const outsideReferralAmount = deal.referrerType === "percent"
      ? deal.totalCommission * (Number(deal.referrerAmount || 0) / 100)
      : Number(deal.referrerAmount || 0);
    result = await buildCompensationEstimate({
      dealType: "rental",
      effectiveDate,
      grossCommission: deal.totalCommission,
      source: deal.compensationSource as "self" | "team" | "homix_rental" | "outside",
      outsideReferralAmount,
      rebateAmount: deal.clientRebate,
      participants: participants.map((row) => ({ agentId: row.agentId, sharePct: row.sharePct })),
    });
  } else {
    const [deal] = await db.select().from(saleDeals).where(eq(saleDeals.id, dealId)).limit(1);
    if (!deal) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    const participants = await db.select().from(saleDealAgents).where(eq(saleDealAgents.saleDealId, dealId));
    effectiveDate = deal.closingDate || deal.contractDate || deal.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    result = await buildCompensationEstimate({
      dealType: "sale",
      effectiveDate,
      grossCommission: deal.grossCommission,
      source: deal.compensationSource as "self" | "team" | "homix_sales" | "outside",
      outsideReferralAmount: Number(deal.referralAmount || 0),
      rebateAmount: deal.clientRebate,
      participants: participants.map((row) => ({ agentId: row.agentId, sharePct: row.sharePct })),
    });
  }

  const finalized = await db.transaction(async (tx) => {
    const snapshot = await persistCompensationSnapshot(tx, { dealType: type, dealId, effectiveDate, result });
    const [row] = await tx
      .update(dealCompensationSnapshots)
      .set({
        status: "finalized",
        finalizedAt: new Date().toISOString(),
        finalizedByEmail: authResult.session.user.email || null,
      })
      .where(eq(dealCompensationSnapshots.id, snapshot.id))
      .returning();
    return row;
  });
  await logAudit(
    authResult.session,
    "finalize",
    "deal_compensation",
    `${type}:${dealId}`,
    `冻结 ${type === "rental" ? "租赁" : "买卖"}成交 #${dealId} 的 v3.1 分佣`,
    result,
  );
  return NextResponse.json({ snapshot: finalized, allocations: result.allocations });
}
