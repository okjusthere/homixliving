import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agentPayouts,
  agents,
  buildings,
  dealAgents,
  deals,
  saleDealAgents,
  saleDeals,
} from "@/db/schema";
import { computeCommission, roundCents } from "@/lib/commission";
import {
  commissionAgentsForDeal,
  getMonthKey,
  getReportDateRange,
} from "@/lib/reporting";
import { requireActiveAgentApi } from "@/lib/auth-guards";

type AgentSummary = {
  id: number;
  name: string;
  splitPct: number;
};

type AgentStat = {
  agent: AgentSummary;
  deals: Set<string>;
  gross: number;
  take: number;
  actualPaid: number;
};

export async function GET(req: NextRequest) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const session = authResult.session;
  const isAdmin = Boolean(session.user.isAdmin);
  const currentAgentId = session.user.agentId;
  if (!isAdmin && currentAgentId == null) {
    return NextResponse.json({ error: "Agent profile is not linked" }, { status: 403 });
  }

  const month = req.nextUrl.searchParams.get("month") || getMonthKey();
  const range = getReportDateRange(month);
  if (!range) {
    return NextResponse.json({ error: "month must be a valid YYYY-MM or YYYY" }, { status: 400 });
  }

  const rentalDate = sql`coalesce(${deals.dealDate}, ${deals.createdAt}::date)`;
  const saleDate = sql`coalesce(${saleDeals.closingDate}, ${saleDeals.contractDate}, ${saleDeals.createdAt}::date)`;
  const rentalPeriod = and(
    ne(deals.status, "cancelled"),
    gte(rentalDate, range.start),
    lt(rentalDate, range.end),
  );
  const salePeriod = and(
    ne(saleDeals.status, "cancelled"),
    eq(saleDeals.stage, "closed"),
    gte(saleDate, range.start),
    lt(saleDate, range.end),
  );

  const rentalQuery = isAdmin
    ? db.select().from(deals).where(rentalPeriod)
    : db
        .select({ deal: deals })
        .from(deals)
        .innerJoin(
          dealAgents,
          and(eq(dealAgents.dealId, deals.id), eq(dealAgents.agentId, currentAgentId!)),
        )
        .where(rentalPeriod)
        .then((rows) => rows.map((row) => row.deal));
  const saleQuery = isAdmin
    ? db.select().from(saleDeals).where(salePeriod)
    : db
        .select({ sale: saleDeals })
        .from(saleDeals)
        .innerJoin(
          saleDealAgents,
          and(
            eq(saleDealAgents.saleDealId, saleDeals.id),
            eq(saleDealAgents.agentId, currentAgentId!),
          ),
        )
        .where(salePeriod)
        .then((rows) => rows.map((row) => row.sale));

  const payoutConditions = [
    gte(agentPayouts.paidAt, range.start),
    lt(agentPayouts.paidAt, range.end),
  ];
  if (!isAdmin) payoutConditions.push(eq(agentPayouts.agentId, currentAgentId!));

  const [dealRows, saleRows, payoutRows] = await Promise.all([
    rentalQuery,
    saleQuery,
    db
      .select({
        agentId: agentPayouts.agentId,
        amountCents: agentPayouts.amountCents,
      })
      .from(agentPayouts)
      .where(and(...payoutConditions)),
  ]);

  const rentalIds = dealRows.map((deal) => deal.id);
  const saleIds = saleRows.map((sale) => sale.id);
  const [dealAgentRows, saleAgentRows] = await Promise.all([
    rentalIds.length > 0
      ? db.select().from(dealAgents).where(inArray(dealAgents.dealId, rentalIds))
      : Promise.resolve([]),
    saleIds.length > 0
      ? db.select().from(saleDealAgents).where(inArray(saleDealAgents.saleDealId, saleIds))
      : Promise.resolve([]),
  ]);

  const agentIds = Array.from(new Set([
    ...dealAgentRows.map((row) => row.agentId),
    ...saleAgentRows.map((row) => row.agentId),
    ...payoutRows.map((row) => row.agentId),
    ...(currentAgentId == null ? [] : [currentAgentId]),
  ]));
  const buildingIds = Array.from(new Set(dealRows.map((deal) => deal.buildingId)));
  const [agentRows, buildingRows] = await Promise.all([
    agentIds.length > 0
      ? db.select().from(agents).where(inArray(agents.id, agentIds))
      : Promise.resolve([]),
    buildingIds.length > 0
      ? db.select().from(buildings).where(inArray(buildings.id, buildingIds))
      : Promise.resolve([]),
  ]);

  const agentById = new Map(agentRows.map((agent) => [agent.id, agent]));
  const buildingById = new Map(buildingRows.map((building) => [building.id, building]));
  const agentStats = new Map<number, AgentStat>();
  const buildingStats = new Map<number, {
    building: (typeof buildingRows)[number];
    deals: number;
    totalCommission: number;
  }>();
  const sourceStats = new Map<string, { source: string; deals: number; totalCommission: number }>();

  const getAgentStat = (agentId: number) => {
    const existing = agentStats.get(agentId);
    if (existing) return existing;
    const agent = agentById.get(agentId);
    const created: AgentStat = {
      agent: {
        id: agentId,
        name: agent?.name || `#${agentId}`,
        splitPct: Number(agent?.splitPct || 0),
      },
      deals: new Set<string>(),
      gross: 0,
      take: 0,
      actualPaid: 0,
    };
    agentStats.set(agentId, created);
    return created;
  };

  let totalCommission = 0;
  let salesGrossCommission = 0;
  let salesCommissionBase = 0;
  let companyPool = 0;
  let estimatedAgentTake = 0;
  let referrerPayouts = 0;

  for (const deal of dealRows) {
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
    const scopedAgents = isAdmin
      ? breakdown.agents
      : breakdown.agents.filter((row) => row.agentId === currentAgentId);
    const scopedGross = scopedAgents.reduce((sum, row) => sum + row.gross, 0);

    totalCommission += isAdmin ? breakdown.totalCommission : scopedGross;
    estimatedAgentTake += scopedAgents.reduce((sum, row) => sum + row.agentTake, 0);
    if (isAdmin) {
      companyPool += breakdown.companyPoolTotal;
      referrerPayouts += breakdown.referrerCut;
    }

    for (const row of scopedAgents) {
      const stat = getAgentStat(row.agentId);
      stat.deals.add(`r${deal.id}`);
      stat.gross += row.gross;
      stat.take += row.agentTake;
    }

    const building = buildingById.get(deal.buildingId);
    if (building && (isAdmin || scopedGross > 0)) {
      const existing = buildingStats.get(building.id) || {
        building,
        deals: 0,
        totalCommission: 0,
      };
      existing.deals += 1;
      existing.totalCommission += isAdmin ? breakdown.totalCommission : scopedGross;
      buildingStats.set(building.id, existing);
    }

    if (isAdmin || scopedGross > 0) {
      const source = deal.source || "unknown";
      const existing = sourceStats.get(source) || { source, deals: 0, totalCommission: 0 };
      existing.deals += 1;
      existing.totalCommission += isAdmin ? breakdown.totalCommission : scopedGross;
      sourceStats.set(source, existing);
    }
  }

  for (const sale of saleRows) {
    const grossCommission = Number(sale.grossCommission || 0);
    const base = Math.max(
      0,
      grossCommission - Number(sale.referralAmount || 0) - Number(sale.brokerageFee || 0),
    );
    const participants = saleAgentRows
      .filter((row) => row.saleDealId === sale.id)
      .map((row) => {
        const agent = agentById.get(row.agentId);
        return {
          agentId: row.agentId,
          name: agent?.name ?? `#${row.agentId}`,
          sharePct: Number(row.sharePct || 0),
          splitPct: Number(agent?.splitPct || 0),
          isPrimary: Boolean(row.isPrimary),
        };
      });
    const breakdown = computeCommission({ totalCommission: base, agents: participants });
    const scopedAgents = isAdmin
      ? breakdown.agents
      : breakdown.agents.filter((row) => row.agentId === currentAgentId);
    const scopedGross = scopedAgents.reduce((sum, row) => sum + row.gross, 0);

    totalCommission += isAdmin ? grossCommission : scopedGross;
    salesGrossCommission += isAdmin ? grossCommission : scopedGross;
    salesCommissionBase += isAdmin ? base : scopedGross;
    estimatedAgentTake += scopedAgents.reduce((sum, row) => sum + row.agentTake, 0);
    if (isAdmin) {
      companyPool += breakdown.companyPoolTotal;
      referrerPayouts += Number(sale.referralAmount || 0);
    }

    for (const row of scopedAgents) {
      const stat = getAgentStat(row.agentId);
      stat.deals.add(`s${sale.id}`);
      stat.gross += row.gross;
      stat.take += row.agentTake;
    }

    if (isAdmin || scopedGross > 0) {
      const source = sale.source || "unknown";
      const existing = sourceStats.get(source) || { source, deals: 0, totalCommission: 0 };
      existing.deals += 1;
      existing.totalCommission += isAdmin ? grossCommission : scopedGross;
      sourceStats.set(source, existing);
    }
  }

  let actualPaid = 0;
  for (const payout of payoutRows) {
    const amount = Number(payout.amountCents || 0) / 100;
    actualPaid += amount;
    getAgentStat(payout.agentId).actualPaid += amount;
  }

  const visibleRentalDeals = isAdmin
    ? dealRows.length
    : dealRows.filter((deal) => dealAgentRows.some(
        (row) => row.dealId === deal.id && row.agentId === currentAgentId,
      )).length;
  const visibleSalesDeals = isAdmin
    ? saleRows.length
    : saleRows.filter((sale) => saleAgentRows.some(
        (row) => row.saleDealId === sale.id && row.agentId === currentAgentId,
      )).length;

  return NextResponse.json({
    month,
    scope: isAdmin ? "company" : "personal",
    summary: {
      totalDeals: visibleRentalDeals + visibleSalesDeals,
      rentalDeals: visibleRentalDeals,
      salesDeals: visibleSalesDeals,
      totalCommission: roundCents(totalCommission),
      salesGrossCommission: roundCents(salesGrossCommission),
      salesCommissionBase: roundCents(salesCommissionBase),
      companyPool: roundCents(companyPool),
      agentPayouts: roundCents(estimatedAgentTake),
      actualPaid: roundCents(actualPaid),
      referrerPayouts: roundCents(referrerPayouts),
    },
    topAgents: Array.from(agentStats.values())
      .map((row) => ({
        agent: row.agent,
        deals: row.deals.size,
        gross: roundCents(row.gross),
        take: roundCents(row.take),
        actualPaid: roundCents(row.actualPaid),
      }))
      .sort((a, b) => b.take - a.take || b.actualPaid - a.actualPaid),
    perBuilding: Array.from(buildingStats.values())
      .map((row) => ({ ...row, totalCommission: roundCents(row.totalCommission) }))
      .sort((a, b) => b.totalCommission - a.totalCommission),
    perSource: Array.from(sourceStats.values())
      .map((row) => ({ ...row, totalCommission: roundCents(row.totalCommission) }))
      .sort((a, b) => b.deals - a.deals),
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
