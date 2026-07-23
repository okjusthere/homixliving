import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, buildings, dealAgents, deals } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  activeDeal,
  commissionAgentsForDeal,
  dealInMonth,
  dealInYear,
  getAgentTakeForDeal,
  getDealDate,
  getMonthKey,
  type DealForReporting,
} from "@/lib/reporting";
import { requireActiveAgentApi } from "@/lib/auth-guards";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const agentId = parseInt(id, 10);
  if (!Number.isFinite(agentId)) {
    return NextResponse.json({ error: "Valid agent id is required" }, { status: 400 });
  }
  if (!authResult.session.user.isAdmin && authResult.session.user.agentId !== agentId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const month = req.nextUrl.searchParams.get("month") || getMonthKey();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const agent = await db.select().from(agents).where(eq(agents.id, agentId)).then((rows) => rows[0]);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const [allAgents, allDealAgents, rows] = await Promise.all([
    db.select().from(agents),
    db.select().from(dealAgents),
    db
      .select({
        deal: deals,
        buildingName: buildings.name,
      })
      .from(deals)
      .leftJoin(buildings, eq(deals.buildingId, buildings.id))
      .orderBy(desc(deals.dealDate), desc(deals.createdAt)),
  ]);

  const agentDealIds = new Set(
    allDealAgents
      .filter((dealAgent) => dealAgent.agentId === agentId)
      .map((dealAgent) => dealAgent.dealId)
  );

  const rowsWithTake = rows
    .filter(({ deal }) => activeDeal(deal) && agentDealIds.has(deal.id))
    .map(({ deal, buildingName }) => {
      const participants = commissionAgentsForDeal({
        dealId: deal.id,
        dealAgents: allDealAgents,
        agents: allAgents,
      });
      const personalTake = getAgentTakeForDeal({
        deal: deal as DealForReporting,
        agentId,
        participants,
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
