import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, buildings, deals } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  activeDeal,
  dealInMonth,
  dealInYear,
  getAgentTakeForDeal,
  getDealDate,
  getMonthKey,
  type DealForReporting,
} from "@/lib/reporting";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agentId = parseInt(id, 10);
  if (!Number.isFinite(agentId)) {
    return NextResponse.json({ error: "Valid agent id is required" }, { status: 400 });
  }

  const month = req.nextUrl.searchParams.get("month") || getMonthKey();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const agent = await db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const allAgents = await db.select().from(agents);
  const agentById = new Map(allAgents.map((row) => [row.id, row]));
  const rows = await db
    .select({
      deal: deals,
      buildingName: buildings.name,
    })
    .from(deals)
    .leftJoin(buildings, eq(deals.buildingId, buildings.id))
    .orderBy(desc(deals.dealDate), desc(deals.createdAt));

  const rowsWithTake = rows
    .filter(
      ({ deal }) =>
        activeDeal(deal) && (deal.primaryAgentId === agentId || deal.coAgentId === agentId)
    )
    .map(({ deal, buildingName }) => {
      const primaryAgent = agentById.get(deal.primaryAgentId);
      const coAgent = deal.coAgentId ? agentById.get(deal.coAgentId) : null;
      const personalTake = getAgentTakeForDeal({
        deal: deal as DealForReporting,
        agentId,
        primaryAgentSplitPct: Number(primaryAgent?.splitPct || 0),
        coAgentSplitPct: Number(coAgent?.splitPct || 0),
      });
      return {
        deal,
        buildingName,
        personalTake,
        dealDate: getDealDate(deal),
      };
    });

  const monthRows = rowsWithTake.filter(({ deal }) => dealInMonth(deal, month));
  const ytdRows = rowsWithTake.filter(({ deal }) => dealInYear(deal, month.slice(0, 4)));

  return NextResponse.json({
    month,
    agent,
    deals: monthRows,
    summary: {
      mtdDeals: monthRows.length,
      mtdTake: monthRows.reduce((sum, row) => sum + row.personalTake, 0),
      ytdDeals: ytdRows.length,
      ytdTake: ytdRows.reduce((sum, row) => sum + row.personalTake, 0),
    },
  });
}
