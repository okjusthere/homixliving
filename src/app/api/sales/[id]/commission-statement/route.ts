import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, saleDealAgents, saleDeals, settings } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canViewDealOfType } from "@/lib/deal-access";
import { computeCommission } from "@/lib/commission";
import { generateCommissionStatementPDF } from "@/lib/commission-statement-pdf";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

// Commission Report generated from the recorded sale. 422 when the deal
// doesn't carry enough data — the UI then points at the office template in
// /resources for a manual upload instead.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const dealId = parseInt(String(id), 10);
  if (!Number.isInteger(dealId) || dealId <= 0) {
    return NextResponse.json({ error: "Invalid deal" }, { status: 400 });
  }
  if (!(await canViewDealOfType(auth.session, "sale", dealId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const [deal] = await db.select().from(saleDeals).where(eq(saleDeals.id, dealId)).limit(1);
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const participants = await db
    .select({
      agent: agents,
      sharePct: saleDealAgents.sharePct,
      isPrimary: saleDealAgents.isPrimary,
    })
    .from(saleDealAgents)
    .innerJoin(agents, eq(saleDealAgents.agentId, agents.id))
    .where(eq(saleDealAgents.saleDealId, dealId))
    .orderBy(asc(agents.name));

  const gross = Number(deal.grossCommission || 0);
  if (gross <= 0 || participants.length === 0) {
    return NextResponse.json(
      {
        error: "Insufficient data",
        reason:
          "Gross commission and at least one participating agent are required to generate the report. Upload the office template from Resources instead.",
      },
      { status: 422 },
    );
  }

  const commissionBase = Math.max(
    0,
    gross - Number(deal.referralAmount || 0) - Number(deal.brokerageFee || 0),
  );
  const breakdown = computeCommission({
    totalCommission: commissionBase,
    agents: participants.map((p) => ({
      agentId: p.agent.id,
      name: p.agent.name,
      sharePct: Number(p.sharePct || 0),
      splitPct: Number(p.agent.splitPct || 0),
      isPrimary: !!p.isPrimary,
    })),
  });

  const settingsRows = await db.select().from(settings);
  const settingsMap = new Map(settingsRows.map((row) => [row.key, row.value]));
  const companyName = settingsMap.get("companyName")?.trim() || "Homix Living Inc.";
  const companyAddress = settingsMap.get("companyAddress")?.trim() || null;

  const pdf = await generateCommissionStatementPDF({
    companyName,
    companyAddress,
    generatedAt: new Date().toISOString().slice(0, 10),
    deal: {
      id: deal.id,
      propertyAddress: deal.propertyAddress,
      city: deal.city,
      state: deal.state,
      zip: deal.zip,
      mlsNumber: deal.mlsNumber,
      fileId: deal.fileId,
      representationType: deal.representationType,
      buyerNames: deal.buyerNames,
      sellerNames: deal.sellerNames,
      contractDate: deal.contractDate,
      closingDate: deal.closingDate,
      purchasePrice: deal.purchasePrice,
      listingBrokerage: deal.listingBrokerage,
      cooperatingBrokerage: deal.cooperatingBrokerage,
      grossCommission: gross,
      referralAmount: deal.referralAmount,
      brokerageFee: deal.brokerageFee,
    },
    agents: breakdown.agents.map((a) => {
      const participant = participants.find((p) => p.agent.id === a.agentId);
      return {
        name: a.name || participant?.agent.name || `#${a.agentId}`,
        licenseNumber: participant?.agent.licenseNumber ?? null,
        sharePct: a.sharePct,
        splitPct: a.splitPct,
        agentTake: a.agentTake,
        companyPool: a.companyPool,
      };
    }),
    commissionBase,
  });

  await logAudit(
    auth.session,
    "download",
    "sale_deal",
    dealId,
    `生成佣金结算单（Commission Report）：${deal.propertyAddress}`,
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="commission-report-sale-${dealId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
