import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gt, lte } from "drizzle-orm";
import { db } from "@/db";
import { teamCompensationConfigs, teams } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { logAudit } from "@/lib/audit";
import {
  isTeamCapPreset,
  isTeamSourcedSplitPreset,
  isTeamSplitPreset,
} from "@/lib/team-compensation-policy";
import { lockTeamConfiguration } from "@/lib/advisory-locks";

async function authority(teamId: number) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return { error: auth.error } as const;
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) return { error: NextResponse.json({ error: "Team not found" }, { status: 404 }) } as const;
  const mayManage = auth.session.user.isAdmin || team.leaderAgentId === auth.session.user.agentId;
  if (!mayManage) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return { auth, team } as const;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return NextResponse.json({ error: "Invalid team" }, { status: 400 });
  }
  const access = await authority(teamId);
  if ("error" in access) return access.error;
  const today = new Date().toISOString().slice(0, 10);
  const configs = await db
    .select()
    .from(teamCompensationConfigs)
    .where(and(
      eq(teamCompensationConfigs.teamId, teamId),
      gt(teamCompensationConfigs.effectiveFrom, today),
    ))
    .orderBy(desc(teamCompensationConfigs.effectiveFrom), desc(teamCompensationConfigs.version));
  const [current] = await db
    .select()
    .from(teamCompensationConfigs)
    .where(and(
      eq(teamCompensationConfigs.teamId, teamId),
      lte(teamCompensationConfigs.effectiveFrom, today),
    ))
    .orderBy(desc(teamCompensationConfigs.effectiveFrom), desc(teamCompensationConfigs.version))
    .limit(1);
  return NextResponse.json({ team: access.team, current: current || null, scheduled: configs });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return NextResponse.json({ error: "Invalid team" }, { status: 400 });
  }
  const access = await authority(teamId);
  if ("error" in access) return access.error;
  const body = await req.json().catch(() => ({}));
  const defaultTeamSplitPct = Number(body.defaultTeamSplitPct);
  const teamLeadSplitPct = Number(body.teamLeadSplitPct);
  const teamCapCents = body.teamCapCents == null || body.teamCapCents === ""
    ? null
    : Number(body.teamCapCents);
  if (!isTeamSplitPreset(defaultTeamSplitPct)) {
    return NextResponse.json({ error: "Default team split must be 10%, 15%, or 20%." }, { status: 400 });
  }
  if (!isTeamSourcedSplitPreset(teamLeadSplitPct)) {
    return NextResponse.json({ error: "Team-sourced split must be 10%, 15%, 20%, 25%, or 30%." }, { status: 400 });
  }
  if (!isTeamCapPreset(teamCapCents)) {
    return NextResponse.json({ error: "Team cap must be no cap, $10K, $15K, $20K, or $25K." }, { status: 400 });
  }
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const effectiveFrom = String(body.effectiveFrom || "");
  const minimum = access.auth.session.user.isAdmin ? today : tomorrow;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || effectiveFrom < minimum) {
    return NextResponse.json(
      { error: access.auth.session.user.isAdmin ? "Changes cannot be backdated." : "Team Leader changes must start in the future." },
      { status: 400 },
    );
  }
  const [created] = await db.transaction(async (tx) => {
    await lockTeamConfiguration(tx, teamId);
    const [latest] = await tx
      .select()
      .from(teamCompensationConfigs)
      .where(eq(teamCompensationConfigs.teamId, teamId))
      .orderBy(desc(teamCompensationConfigs.version))
      .limit(1);
    return tx
      .insert(teamCompensationConfigs)
      .values({
        teamId,
        version: Number(latest?.version || 0) + 1,
        effectiveFrom,
        defaultTeamSplitPct,
        teamLeadSplitPct,
        teamCapCents,
        createdByEmail: access.auth.session.user.email || null,
      })
      .returning();
  });
  await logAudit(
    access.auth.session,
    "update",
    "team_compensation",
    teamId,
    `${access.team.name} 团队方案自 ${effectiveFrom} 发布：${defaultTeamSplitPct}% / 客源 ${teamLeadSplitPct}% / Cap ${teamCapCents == null ? "无" : `$${teamCapCents / 100}`}`,
    { configId: created.id, defaultTeamSplitPct, teamLeadSplitPct, teamCapCents, effectiveFrom },
  );
  return NextResponse.json(created, { status: 201 });
}
