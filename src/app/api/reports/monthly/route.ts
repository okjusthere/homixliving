import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, buildings, dealAgents, deals } from "@/db/schema";
import { computeCommission } from "@/lib/commission";
import { activeDeal, commissionAgentsForDeal, dealInMonth, getMonthKey } from "@/lib/reporting";
import { requireAdminApi } from "@/lib/auth-guards";

export async function GET(req: NextRequest) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  const month = req.nextUrl.searchParams.get("month") || getMonthKey();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const [dealRows, agentRows, buildingRows, dealAgentRows] = await Promise.all([
    db.select().from(deals),
    db.select().from(agents),
    db.select().from(buildings),
    db.select().from(dealAgents),
  ]);
  const buildingById = new Map(buildingRows.map((building) => [building.id, building]));
  const monthDeals = dealRows.filter((deal) => activeDeal(deal) && dealInMonth(deal, month));

  const agentStats = new Map<number, { agent: (typeof agentRows)[number]; deals: Set<number>; take: number }>();
  const buildingStats = new Map<number, { building: (typeof buildingRows)[number]; deals: number; totalCommission: number }>();
  const sourceStats = new Map<string, { source: string; deals: number; totalCommission: number }>();

  let companyPool = 0;
  let agentPayouts = 0;
  let referrerPayouts = 0;

  for (const deal of monthDeals) {
    const participants = commissionAgentsForDeal({
      dealId: deal.id,
      dealAgents: dealAgentRows,
      agents: agentRows,
    });
    const breakdown = computeCommission({
      totalCommission: Number(deal.totalCommission || 0),
      referrer:
        deal.referrerType === "percent" || deal.referrerType === "flat"
          ? { type: deal.referrerType, amount: Number(deal.referrerAmount || 0) }
          : null,
      agents: participants,
    });

    companyPool += breakdown.companyPoolTotal;
    agentPayouts += breakdown.agentTakeTotal;
    referrerPayouts += breakdown.referrerCut;

    for (const agentBreakdown of breakdown.agents) {
      const agent = agentRows.find((row) => row.id === agentBreakdown.agentId);
      if (!agent) continue;
      const existing = agentStats.get(agent.id) || { agent, deals: new Set<number>(), take: 0 };
      existing.deals.add(deal.id);
      existing.take += agentBreakdown.agentTake;
      agentStats.set(agent.id, existing);
    }

    const building = buildingById.get(deal.buildingId);
    if (building) {
      const existing = buildingStats.get(building.id) || { building, deals: 0, totalCommission: 0 };
      existing.deals += 1;
      existing.totalCommission += Number(deal.totalCommission || 0);
      buildingStats.set(building.id, existing);
    }

    const source = deal.source || "unknown";
    const sourceExisting = sourceStats.get(source) || { source, deals: 0, totalCommission: 0 };
    sourceExisting.deals += 1;
    sourceExisting.totalCommission += Number(deal.totalCommission || 0);
    sourceStats.set(source, sourceExisting);
  }

  return NextResponse.json({
    month,
    summary: {
      totalDeals: monthDeals.length,
      totalCommission: monthDeals.reduce((sum, deal) => sum + Number(deal.totalCommission || 0), 0),
      companyPool,
      agentPayouts,
      referrerPayouts,
    },
    topAgents: Array.from(agentStats.values())
      .map((row) => ({ agent: row.agent, deals: row.deals.size, take: row.take }))
      .sort((a, b) => b.take - a.take),
    perBuilding: Array.from(buildingStats.values()).sort((a, b) => b.totalCommission - a.totalCommission),
    perSource: Array.from(sourceStats.values()).sort((a, b) => b.deals - a.deals),
  });
}
