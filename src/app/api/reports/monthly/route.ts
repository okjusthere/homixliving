import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, buildings, dealAgents, deals, saleDealAgents, saleDeals } from "@/db/schema";
import { computeCommission } from "@/lib/commission";
import {
  activeDeal,
  commissionAgentsForDeal,
  dealInMonth,
  dealInYear,
  getMonthKey,
} from "@/lib/reporting";
import { requireAdminApi } from "@/lib/auth-guards";

// A sale counts in the month it closed (closingDate, falling back to
// contractDate). Only stage === "closed" sales are production — pipeline
// stages would inflate the numbers with money that hasn't arrived.
function saleDate(sale: { closingDate: string | null; contractDate: string | null; createdAt: string | null }) {
  return sale.closingDate || sale.contractDate || sale.createdAt || "";
}

export async function GET(req: NextRequest) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  // Accepts YYYY-MM (single month) or YYYY (whole year / YTD view).
  const month = req.nextUrl.searchParams.get("month") || getMonthKey();
  const isYear = /^\d{4}$/.test(month);
  if (!isYear && !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM or YYYY" }, { status: 400 });
  }

  const [dealRows, agentRows, buildingRows, dealAgentRows, saleRows, saleAgentRows] =
    await Promise.all([
      db.select().from(deals),
      db.select().from(agents),
      db.select().from(buildings),
      db.select().from(dealAgents),
      db.select().from(saleDeals),
      db.select().from(saleDealAgents),
    ]);
  const buildingById = new Map(buildingRows.map((building) => [building.id, building]));
  const agentById = new Map(agentRows.map((agent) => [agent.id, agent]));
  const monthDeals = dealRows.filter(
    (deal) =>
      activeDeal(deal) &&
      (isYear ? dealInYear(deal, month) : dealInMonth(deal, month))
  );
  const monthSales = saleRows.filter(
    (sale) =>
      sale.status !== "cancelled" &&
      sale.stage === "closed" &&
      saleDate(sale).startsWith(month)
  );

  const agentStats = new Map<number, { agent: (typeof agentRows)[number]; deals: Set<string>; take: number }>();
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
      const agent = agentById.get(agentBreakdown.agentId);
      if (!agent) continue;
      const existing = agentStats.get(agent.id) || { agent, deals: new Set<string>(), take: 0 };
      existing.deals.add(`r${deal.id}`);
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

  // Closed sales — same split engine as the sale detail page: the split base
  // is gross minus referral minus brokerage fee. (perBuilding / perSource
  // remain rental-only; sales have free-form addresses, not building rows.)
  let salesGrossCommission = 0;
  let salesCommissionBase = 0;
  for (const sale of monthSales) {
    const base = Math.max(
      0,
      Number(sale.grossCommission || 0) -
        Number(sale.referralAmount || 0) -
        Number(sale.brokerageFee || 0)
    );
    salesGrossCommission += Number(sale.grossCommission || 0);
    salesCommissionBase += base;
    referrerPayouts += Number(sale.referralAmount || 0);

    const participants = saleAgentRows
      .filter((row) => row.saleDealId === sale.id)
      .map((row) => {
        const agent = agentById.get(row.agentId);
        return {
          agentId: row.agentId,
          name: agent?.name ?? `#${row.agentId}`,
          sharePct: Number(row.sharePct || 0),
          splitPct: Number(agent?.splitPct || 0),
          isPrimary: !!row.isPrimary,
        };
      });
    const breakdown = computeCommission({ totalCommission: base, agents: participants });

    companyPool += breakdown.companyPoolTotal;
    agentPayouts += breakdown.agentTakeTotal;

    for (const agentBreakdown of breakdown.agents) {
      const agent = agentById.get(agentBreakdown.agentId);
      if (!agent) continue;
      const existing = agentStats.get(agent.id) || { agent, deals: new Set<string>(), take: 0 };
      existing.deals.add(`s${sale.id}`);
      existing.take += agentBreakdown.agentTake;
      agentStats.set(agent.id, existing);
    }
  }

  return NextResponse.json({
    month,
    summary: {
      totalDeals: monthDeals.length + monthSales.length,
      rentalDeals: monthDeals.length,
      salesDeals: monthSales.length,
      totalCommission:
        monthDeals.reduce((sum, deal) => sum + Number(deal.totalCommission || 0), 0) +
        salesGrossCommission,
      salesGrossCommission,
      salesCommissionBase,
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
