import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, deals, teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  activeDeal,
  dealInMonth,
  getAgentTakeForDeal,
  getMonthKey,
  type DealForReporting,
} from "@/lib/reporting";

function parseId(value: unknown) {
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET() {
  const [teamRows, agentRows, dealRows] = await Promise.all([
    db.select().from(teams).orderBy(teams.name),
    db.select().from(agents).orderBy(agents.name),
    db.select().from(deals),
  ]);
  const agentById = new Map(agentRows.map((agent) => [agent.id, agent]));
  const month = getMonthKey();

  const result = teamRows.map((team) => {
    const members = agentRows.filter((agent) => agent.teamId === team.id && agent.isActive !== false);
    const memberIds = new Set(members.map((agent) => agent.id));
    const monthDeals = dealRows.filter(
      (deal) =>
        activeDeal(deal) &&
        dealInMonth(deal, month) &&
        (memberIds.has(deal.primaryAgentId) || (deal.coAgentId ? memberIds.has(deal.coAgentId) : false))
    );
    const mtdTake = monthDeals.reduce((sum, deal) => {
      const primaryAgent = agentById.get(deal.primaryAgentId);
      const coAgent = deal.coAgentId ? agentById.get(deal.coAgentId) : null;
      const primaryTake = memberIds.has(deal.primaryAgentId)
        ? getAgentTakeForDeal({
            deal: deal as DealForReporting,
            agentId: deal.primaryAgentId,
            primaryAgentSplitPct: Number(primaryAgent?.splitPct || 0),
            coAgentSplitPct: Number(coAgent?.splitPct || 0),
          })
        : 0;
      const coTake =
        deal.coAgentId && memberIds.has(deal.coAgentId)
          ? getAgentTakeForDeal({
              deal: deal as DealForReporting,
              agentId: deal.coAgentId,
              primaryAgentSplitPct: Number(primaryAgent?.splitPct || 0),
              coAgentSplitPct: Number(coAgent?.splitPct || 0),
            })
          : 0;
      return sum + primaryTake + coTake;
    }, 0);

    return {
      team,
      leader: team.leaderAgentId ? agentById.get(team.leaderAgentId) || null : null,
      members,
      memberCount: members.length,
      mtdDeals: monthDeals.length,
      mtdTake,
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const leaderAgentId = body.leaderAgentId ? parseId(body.leaderAgentId) : null;
    const [created] = await db
      .insert(teams)
      .values({
        name,
        leaderAgentId,
        notes: body.notes ? String(body.notes) : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .returning();
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Team creation failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const id = parseId(body.id);
    if (!id) return NextResponse.json({ error: "Valid team id is required" }, { status: 400 });
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const leaderAgentId = body.leaderAgentId ? parseId(body.leaderAgentId) : null;
    const [updated] = await db
      .update(teams)
      .set({
        name,
        leaderAgentId,
        notes: body.notes ? String(body.notes) : null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(teams.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Team update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    const parsedId = parseId(id);
    if (!parsedId) return NextResponse.json({ error: "Valid team id is required" }, { status: 400 });
    await db.update(agents).set({ teamId: null }).where(eq(agents.teamId, parsedId));
    await db.delete(teams).where(eq(teams.id, parsedId));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Team delete failed" }, { status: 500 });
  }
}
