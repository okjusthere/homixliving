import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { agents, onboardingInvitations, teams } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { normalizeAgentPlan, type AgentPlan } from "@/lib/agent-plans";
import {
  cleanOnboardingSource,
  createInviteToken,
  hashInviteToken,
} from "@/lib/onboarding-invites";

const INVITE_PLANS = new Set<AgentPlan>(["solo", "solo_pro", "team_member", "holding"]);

function baseUrl(request: Request) {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    new URL(request.url).origin
  ).replace(/\/+$/, "");
}

async function invitationAuthority() {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return { ok: false as const, error: auth.error };
  const agentId = auth.session.user.agentId;
  if (!agentId) return { ok: false as const, error: NextResponse.json({ error: "Agent not found" }, { status: 404 }) };
  const ledTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.leaderAgentId, agentId));
  if (!auth.session.user.isAdmin && ledTeams.length === 0) {
    return { ok: false as const, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, session: auth.session, agentId, ledTeamIds: ledTeams.map((team) => team.id) };
}

export async function GET() {
  const authority = await invitationAuthority();
  if (!authority.ok) return authority.error;
  const rows = await db
    .select({
      invite: onboardingInvitations,
      teamName: teams.name,
      sponsorName: agents.name,
    })
    .from(onboardingInvitations)
    .leftJoin(teams, eq(teams.id, onboardingInvitations.teamId))
    .leftJoin(agents, eq(agents.id, onboardingInvitations.sponsorAgentId))
    .where(
      authority.session.user.isAdmin
        ? isNull(onboardingInvitations.revokedAt)
        : and(
            isNull(onboardingInvitations.revokedAt),
            eq(onboardingInvitations.createdByAgentId, authority.agentId),
          ),
    )
    .orderBy(desc(onboardingInvitations.createdAt));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const authority = await invitationAuthority();
  if (!authority.ok) return authority.error;
  const body = await request.json().catch(() => ({}));
  const requestedTeamId = body.teamId ? Number(body.teamId) : null;
  if (
    !authority.session.user.isAdmin &&
    (!requestedTeamId || !authority.ledTeamIds.includes(requestedTeamId))
  ) {
    return NextResponse.json({ error: "Team leaders may only invite to their own team." }, { status: 403 });
  }
  let selectedTeamLeaderId: number | null = null;
  if (requestedTeamId) {
    const [team] = await db
      .select({ id: teams.id, leaderAgentId: teams.leaderAgentId })
      .from(teams)
      .where(eq(teams.id, requestedTeamId))
      .limit(1);
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    selectedTeamLeaderId = team.leaderAgentId;
  }

  const requestedPlan = normalizeAgentPlan(body.plan);
  const plan = requestedTeamId ? "team_member" : requestedPlan;
  if (!INVITE_PLANS.has(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  const sponsorAgentId = authority.session.user.isAdmin
    ? body.sponsorAgentId ? Number(body.sponsorAgentId) : selectedTeamLeaderId
    : authority.agentId;
  if (sponsorAgentId) {
    const [sponsor] = await db.select({ id: agents.id }).from(agents).where(eq(agents.id, sponsorAgentId)).limit(1);
    if (!sponsor) return NextResponse.json({ error: "Sponsor not found" }, { status: 404 });
  }
  const email = typeof body.email === "string" && body.email.trim()
    ? body.email.trim().toLowerCase()
    : null;
  const maxUses = email ? 1 : Math.min(500, Math.max(1, Number(body.maxUses) || 100));
  const days = Math.min(90, Math.max(1, Number(body.expiresInDays) || 30));
  const token = createInviteToken();
  const [invite] = await db.insert(onboardingInvitations).values({
    tokenHash: hashInviteToken(token),
    email,
    source: cleanOnboardingSource(body.source),
    teamId: requestedTeamId,
    sponsorAgentId,
    plan,
    affiliationTermMonths: Number(body.affiliationTermMonths) === 24 ? 24 : 12,
    expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
    maxUses,
    createdByAgentId: authority.agentId,
  }).returning();
  return NextResponse.json({
    invite,
    url: `${baseUrl(request)}/join/${token}`,
  }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const authority = await invitationAuthority();
  if (!authority.ok) return authority.error;
  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid invitation" }, { status: 400 });
  }
  const conditions = [eq(onboardingInvitations.id, id)];
  if (!authority.session.user.isAdmin) {
    conditions.push(eq(onboardingInvitations.createdByAgentId, authority.agentId));
  }
  const [revoked] = await db.update(onboardingInvitations).set({
    revokedAt: new Date().toISOString(),
  }).where(and(...conditions)).returning({ id: onboardingInvitations.id });
  if (!revoked) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
