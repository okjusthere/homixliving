import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  agents,
  dealAgents,
  deals,
  teamCompensationConfigs,
  teamJoinRequests,
  teams,
} from "@/db/schema";
import { and, desc, eq, lte, ne } from "drizzle-orm";
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
import {
  isTeamCapPreset,
  isTeamSourcedSplitPreset,
  isTeamSplitPreset,
} from "@/lib/team-compensation-policy";
import { teamDeletionBlocker } from "@/lib/team-join-requests";

function parseId(value: unknown) {
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET() {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const [teamRows, agentRows, dealRows, dealAgentRows, configRows] = await Promise.all([
    db.select().from(teams).orderBy(teams.name),
    db.select().from(agents).orderBy(agents.name),
    db.select().from(deals),
    db.select().from(dealAgents),
    db
      .select()
      .from(teamCompensationConfigs)
      .where(lte(teamCompensationConfigs.effectiveFrom, new Date().toISOString().slice(0, 10)))
      .orderBy(desc(teamCompensationConfigs.effectiveFrom), desc(teamCompensationConfigs.version)),
  ]);
  const agentById = new Map(agentRows.map((agent) => [agent.id, agent]));
  const currentConfigByTeam = new Map<number, (typeof configRows)[number]>();
  for (const config of configRows) {
    if (!currentConfigByTeam.has(config.teamId)) currentConfigByTeam.set(config.teamId, config);
  }

  // Non-admins get team names + membership only — never per-team month-to-date
  // earnings or member compensation/PII. Only admins see the enriched figures.
  if (!authResult.session.user.isAdmin) {
    const slim = teamRows.map((team) => {
      const members = agentRows
        .filter((agent) => agent.teamId === team.id && agent.accountStatus === "active")
        .map((agent) => ({ id: agent.id, name: agent.name }));
      const leaderAgent = team.leaderAgentId ? agentById.get(team.leaderAgentId) : null;
      return {
        team: { id: team.id, name: team.name },
        compensationConfig: currentConfigByTeam.get(team.id) || null,
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
    const members = agentRows.filter(
      (agent) => agent.teamId === team.id && agent.accountStatus === "active",
    );
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
      compensationConfig: currentConfigByTeam.get(team.id) || null,
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
    const today = new Date().toISOString().slice(0, 10);
    const [created] = await db
      .transaction(async (tx) => {
        const [team] = await tx.insert(teams).values({
          name,
          leaderAgentId,
          notes: body.notes ? String(body.notes) : null,
        }).returning();
        await tx.insert(teamCompensationConfigs).values({
          teamId: team.id,
          version: 1,
          effectiveFrom: today,
          defaultTeamSplitPct: 10,
          teamLeadSplitPct: 10,
          teamCapCents: null,
          createdByEmail: authResult.session.user.email || null,
        });
        if (leaderAgentId) {
          await tx.update(agents).set({
            plan: "team_leader",
            splitPct: 100,
            planEffectiveFrom: today,
          }).where(eq(agents.id, leaderAgentId));
        }
        return [team];
      });
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
    const defaultTeamSplitPct = Number(body.defaultTeamSplitPct ?? 10);
    const teamLeadSplitPct = Number(body.teamLeadSplitPct ?? defaultTeamSplitPct);
    const teamCapCents = body.teamCapCents == null || body.teamCapCents === "" ? null : Number(body.teamCapCents);
    if (!isTeamSplitPreset(defaultTeamSplitPct)) {
      return NextResponse.json({ error: "Default team split must be 10%, 15%, or 20%" }, { status: 400 });
    }
    if (!isTeamSourcedSplitPreset(teamLeadSplitPct)) {
      return NextResponse.json({ error: "Team-sourced split must be 10%, 15%, 20%, 25%, or 30%" }, { status: 400 });
    }
    if (!isTeamCapPreset(teamCapCents)) {
      return NextResponse.json({ error: "Invalid team cap preset" }, { status: 400 });
    }
    const today = new Date().toISOString().slice(0, 10);
    const effectiveFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(body.effectiveFrom || ""))
      ? String(body.effectiveFrom)
      : today;
    if (effectiveFrom < today) {
      return NextResponse.json(
        { error: "Team compensation changes cannot be backdated" },
        { status: 400 },
      );
    }
    const [currentTeam] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    if (!currentTeam) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    if (currentTeam.status === "forming") {
      return NextResponse.json(
        { error: "Forming team leadership and v1 terms are locked until onboarding is complete." },
        { status: 409 },
      );
    }
    if (currentTeam.leaderAgentId !== leaderAgentId && effectiveFrom > today) {
      return NextResponse.json(
        { error: "Leader changes take effect immediately; only compensation terms may be scheduled." },
        { status: 409 },
      );
    }
    const [updated] = await db.transaction(async (tx) => {
      const [team] = await tx.update(teams).set({
        name,
        leaderAgentId,
        notes: body.notes ? String(body.notes) : null,
      }).where(eq(teams.id, id)).returning();
      const [latest] = await tx
        .select({ version: teamCompensationConfigs.version })
        .from(teamCompensationConfigs)
        .where(eq(teamCompensationConfigs.teamId, id))
        .orderBy(desc(teamCompensationConfigs.version))
        .limit(1);
      await tx.insert(teamCompensationConfigs).values({
        teamId: id,
        version: Number(latest?.version || 0) + 1,
        effectiveFrom,
        defaultTeamSplitPct,
        teamLeadSplitPct,
        teamCapCents,
        createdByEmail: authResult.session.user.email || null,
      });
      if (currentTeam.leaderAgentId && currentTeam.leaderAgentId !== leaderAgentId) {
        const [otherLeadership] = await tx
          .select({ id: teams.id })
          .from(teams)
          .where(and(
            eq(teams.leaderAgentId, currentTeam.leaderAgentId),
            ne(teams.id, id),
          ))
          .limit(1);
        if (!otherLeadership) {
          await tx.update(agents).set({
            plan: "solo_pro",
            splitPct: 100,
            planEffectiveFrom: today,
          }).where(eq(agents.id, currentTeam.leaderAgentId));
        }
      }
      if (leaderAgentId && currentTeam.status === "active") {
        await tx.update(agents).set({
          plan: "team_leader",
          splitPct: 100,
          planEffectiveFrom: today,
        }).where(eq(agents.id, leaderAgentId));
      }
      return [team];
    });
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
    const deleted = await db.transaction(async (tx) => {
      const [team] = await tx.select().from(teams).where(eq(teams.id, parsedId)).limit(1);
      if (!team) return "missing" as const;
      if (team.status === "forming") return "forming_locked" as const;
      const [member] = await tx
        .select({ id: agents.id })
        .from(agents)
        .where(eq(agents.teamId, parsedId))
        .limit(1);
      const [application] = await tx
        .select({ id: teamJoinRequests.id })
        .from(teamJoinRequests)
        .where(eq(teamJoinRequests.teamId, parsedId))
        .limit(1);
      const blocker = teamDeletionBlocker({
        hasMembers: Boolean(member),
        hasApplications: Boolean(application),
      });
      if (blocker) return blocker;
      await tx.delete(teams).where(eq(teams.id, parsedId));
      if (team?.leaderAgentId) {
        await tx.update(agents).set({
          plan: "solo_pro",
          splitPct: 100,
          planEffectiveFrom: new Date().toISOString().slice(0, 10),
        }).where(eq(agents.id, team.leaderAgentId));
      }
      return "deleted" as const;
    });
    if (deleted === "missing") return NextResponse.json({ error: "Team not found" }, { status: 404 });
    if (deleted === "forming_locked") {
      return NextResponse.json(
        { error: "A forming team cannot be deleted while its Team Leader onboarding is in progress." },
        { status: 409 },
      );
    }
    if (deleted === "has_members") {
      return NextResponse.json(
        { error: "Move every team member to another plan or team before deleting this team." },
        { status: 409 },
      );
    }
    if (deleted === "has_applications") {
      return NextResponse.json(
        { error: "Resolve or move every team application before deleting this team." },
        { status: 409 },
      );
    }
    await logAudit(authResult.session, "delete", "team", parsedId, `删除空团队 #${parsedId}`);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Team delete failed" }, { status: 500 });
  }
}
