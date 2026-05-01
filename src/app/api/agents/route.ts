import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, deals, teams } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  activeDeal,
  dealInMonth,
  getAgentTakeForDeal,
  getMonthKey,
  type DealForReporting,
} from "@/lib/reporting";

function numberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanAgentPayload(body: Record<string, unknown>) {
  const splitPct = numberOrNull(body.splitPct);
  const teamId = numberOrNull(body.teamId);
  return {
    name: String(body.name || "").trim(),
    email: body.email ? String(body.email).trim() : null,
    phone: body.phone ? String(body.phone).trim() : null,
    licenseNumber: body.licenseNumber ? String(body.licenseNumber).trim() : null,
    licensedCompany: body.licensedCompany ? String(body.licensedCompany).trim() : null,
    splitPct: splitPct ?? 50,
    teamId,
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    joinedAt: body.joinedAt ? String(body.joinedAt) : null,
    notes: body.notes ? String(body.notes) : null,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const teamIdParam = req.nextUrl.searchParams.get("teamId");
  const teamId = teamIdParam ? parseInt(teamIdParam, 10) : null;

  const rows = await db
    .select({
      agent: agents,
      teamName: teams.name,
    })
    .from(agents)
    .leftJoin(teams, eq(agents.teamId, teams.id))
    .where(teamId && Number.isFinite(teamId) ? eq(agents.teamId, teamId) : undefined)
    .orderBy(teams.name, agents.name);

  const allAgents = await db.select().from(agents);
  const agentById = new Map(allAgents.map((agent) => [agent.id, agent]));
  const currentMonth = getMonthKey();
  const allDeals = await db.select().from(deals);

  const result = rows.map((row) => {
    const monthDeals = allDeals.filter(
      (deal) =>
        activeDeal(deal) &&
        dealInMonth(deal, currentMonth) &&
        (deal.primaryAgentId === row.agent.id || deal.coAgentId === row.agent.id)
    );
    const mtdTake = monthDeals.reduce((sum, deal) => {
      const primaryAgent = agentById.get(deal.primaryAgentId);
      const coAgent = deal.coAgentId ? agentById.get(deal.coAgentId) : null;
      return (
        sum +
        getAgentTakeForDeal({
          deal: deal as DealForReporting,
          agentId: row.agent.id,
          primaryAgentSplitPct: Number(primaryAgent?.splitPct || 0),
          coAgentSplitPct: Number(coAgent?.splitPct || 0),
        })
      );
    }, 0);
    return { ...row, mtdDeals: monthDeals.length, mtdTake };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = cleanAgentPayload(body);
    if (!data.name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (data.splitPct < 0 || data.splitPct > 100) {
      return NextResponse.json({ error: "Split must be between 0 and 100" }, { status: 400 });
    }
    if (data.teamId) {
      const team = await db.select().from(teams).where(eq(teams.id, data.teamId)).get();
      if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }
    const [created] = await db
      .insert(agents)
      .values({ ...data, createdAt: new Date().toISOString() })
      .returning();
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Agent creation failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const id = parseInt(String(body.id), 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Valid agent id is required" }, { status: 400 });
    }
    const data = cleanAgentPayload(body);
    if (!data.name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (data.splitPct < 0 || data.splitPct > 100) {
      return NextResponse.json({ error: "Split must be between 0 and 100" }, { status: 400 });
    }
    const [updated] = await db.update(agents).set(data).where(eq(agents.id, id)).returning();
    if (!updated) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Agent update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    const parsedId = parseInt(String(id), 10);
    if (!Number.isFinite(parsedId)) {
      return NextResponse.json({ error: "Valid agent id is required" }, { status: 400 });
    }
    await db
      .update(agents)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(and(eq(agents.id, parsedId), eq(agents.isActive, true)));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Agent delete failed" }, { status: 500 });
  }
}
