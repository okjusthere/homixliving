import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, dealAgents, deals, teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  activeDeal,
  commissionAgentsForDeal,
  dealInMonth,
  getAgentTakeForDeal,
  getMonthKey,
  type DealForReporting,
} from "@/lib/reporting";
import { requireActiveAgentApi, requireAdminApi } from "@/lib/auth-guards";
import { logAudit } from "@/lib/audit";

function parseId(value: unknown) {
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET() {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const [teamRows, agentRows, dealRows, dealAgentRows] = await Promise.all([
    db.select().from(teams).orderBy(teams.name),
    db.select().from(agents).orderBy(agents.name),
    db.select().from(deals),
    db.select().from(dealAgents),
  ]);
  const agentById = new Map(agentRows.map((agent) => [agent.id, agent]));

  // Non-admins get team names + membership only — never per-team month-to-date
  // earnings or member compensation/PII. Only admins see the enriched figures.
  if (!authResult.session.user.isAdmin) {
    const slim = teamRows.map((team) => {
      const members = agentRows
        .filter((agent) => agent.teamId === team.id && agent.isActive !== false)
        .map((agent) => ({ id: agent.id, name: agent.name }));
      const leaderAgent = team.leaderAgentId ? agentById.get(team.leaderAgentId) : null;
      return {
        team: { id: team.id, name: team.name },
        leader: leaderAgent ? { id: leaderAgent.id, name: leaderAgent.name } : null,
        members,
        memberCount: members.length,
        mtdDeals: 0,
        mtdTake: 0,
      };
    });
    return NextResponse.json(slim);
  }

  const month = getMonthKey();

  const result = teamRows.map((team) => {
    const members = agentRows.filter((agent) => agent.teamId === team.id && agent.isActive !== false);
    const memberIds = new Set(members.map((agent) => agent.id));
    const memberDealIds = new Set(
      dealAgentRows
        .filter((dealAgent) => memberIds.has(dealAgent.agentId))
        .map((dealAgent) => dealAgent.dealId)
    );
    const monthDeals = dealRows.filter(
      (deal) =>
        activeDeal(deal) &&
        dealInMonth(deal, month) &&
        memberDealIds.has(deal.id)
    );
    const mtdTake = monthDeals.reduce((sum, deal) => {
      const participants = commissionAgentsForDeal({
        dealId: deal.id,
        dealAgents: dealAgentRows,
        agents: agentRows,
      });
      return (
        sum +
        participants
          .filter((participant) => memberIds.has(participant.agentId))
          .reduce(
            (participantSum, participant) =>
              participantSum +
              getAgentTakeForDeal({
                deal: deal as DealForReporting,
                agentId: participant.agentId,
                participants,
              }),
            0
          )
      );
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
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

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
      })
      .returning();
    await logAudit(authResult.session, "create", "team", created.id, `新建团队 ${created.name}`);
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Team creation failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

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
      })
      .where(eq(teams.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    await logAudit(authResult.session, "update", "team", updated.id, `更新团队 ${updated.name}`, body);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Team update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  try {
    const { id } = await req.json();
    const parsedId = parseId(id);
    if (!parsedId) return NextResponse.json({ error: "Valid team id is required" }, { status: 400 });
    await db.update(agents).set({ teamId: null }).where(eq(agents.teamId, parsedId));
    await db.delete(teams).where(eq(teams.id, parsedId));
    await logAudit(authResult.session, "delete", "team", parsedId, `删除团队 #${parsedId}（成员已移出）`);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Team delete failed" }, { status: 500 });
  }
}
