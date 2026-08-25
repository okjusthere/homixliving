import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  onboardingEvents,
  onboardingInvitations,
  teamCompensationConfigs,
  teamLeaderApplications,
  teams,
} from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { logAudit } from "@/lib/audit";
import { normalizeAgentPlan, type AgentPlan } from "@/lib/agent-plans";
import {
  cleanOnboardingSource,
  createInviteToken,
  hashInviteToken,
} from "@/lib/onboarding-invites";
import {
  defaultInvitationLocks,
  type InvitationKind,
} from "@/lib/onboarding-routing";
import { canAssignInvitationSponsor } from "@/lib/onboarding-invitation-policy";
import { onboardingEventValues } from "@/lib/onboarding-events";
import { canCreateTeamRecruitingInvitation } from "@/lib/team-leader-applications";

const INVITE_PLANS = new Set<AgentPlan>(["solo", "solo_pro", "team_member"]);

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
    .where(authority.session.user.isAdmin
      ? isNull(onboardingInvitations.revokedAt)
      : and(
          isNull(onboardingInvitations.revokedAt),
          or(
            eq(onboardingInvitations.createdByAgentId, authority.agentId),
            ...(authority.ledTeamIds.length
              ? [and(
                  eq(onboardingInvitations.kind, "team_recruiting"),
                  inArray(onboardingInvitations.teamId, authority.ledTeamIds),
                )]
              : []),
          ),
        ))
    .orderBy(desc(onboardingInvitations.createdAt));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const authority = await invitationAuthority();
  if (!authority.ok) return authority.error;
  const body = await request.json().catch(() => ({}));
  const requestedTeamId = body.teamId ? Number(body.teamId) : null;
  if (requestedTeamId !== null && (!Number.isInteger(requestedTeamId) || requestedTeamId <= 0)) {
    return NextResponse.json({ error: "Invalid team" }, { status: 400 });
  }
  const requestedKind = String(body.kind || "");
  if (
    requestedKind !== "personal_referral" &&
    requestedKind !== "team_recruiting" &&
    requestedKind !== "admin"
  ) {
    return NextResponse.json({ error: "Invitation type is required." }, { status: 400 });
  }
  const kind: InvitationKind = requestedKind;
  if (kind === "admin" && !authority.session.user.isAdmin) {
    return NextResponse.json({ error: "Only admins may create admin invitations." }, { status: 403 });
  }
  if (kind === "team_recruiting" && !requestedTeamId) {
    return NextResponse.json({ error: "Team recruiting invitations require a team." }, { status: 400 });
  }
  if (
    kind === "team_recruiting" &&
    !authority.session.user.isAdmin &&
    !authority.ledTeamIds.includes(requestedTeamId!)
  ) {
    return NextResponse.json({ error: "Team leaders may only invite to their own team." }, { status: 403 });
  }
  if (kind === "personal_referral" && requestedTeamId) {
    return NextResponse.json({ error: "Personal referral links cannot assign a team." }, { status: 400 });
  }
  let selectedTeamLeaderId: number | null = null;
  if (requestedTeamId) {
    const [team] = await db
      .select({ id: teams.id, leaderAgentId: teams.leaderAgentId, status: teams.status })
      .from(teams)
      .where(eq(teams.id, requestedTeamId))
      .limit(1);
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    selectedTeamLeaderId = team.leaderAgentId;
    if (kind === "team_recruiting") {
      const [leaderApplication] = team.status === "forming"
        ? await db
            .select({ agreementStatus: teamLeaderApplications.agreementStatus })
            .from(teamLeaderApplications)
            .where(eq(teamLeaderApplications.teamId, team.id))
            .limit(1)
        : [];
      if (!canCreateTeamRecruitingInvitation({
        teamStatus: team.status,
        leaderAgreementStatus: leaderApplication?.agreementStatus || null,
      })) {
        return NextResponse.json(
          { error: team.status === "forming"
            ? "Complete the Team Leader agreement before recruiting."
            : "This team is not accepting recruits." },
          { status: 409 },
        );
      }
    }
  }

  if (body.plan !== undefined && !INVITE_PLANS.has(String(body.plan) as AgentPlan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  const requestedPlan = normalizeAgentPlan(body.plan);
  const plan = kind === "team_recruiting" ? "team_member" : requestedPlan;
  if (!INVITE_PLANS.has(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  if (plan === "team_member" && !requestedTeamId) {
    return NextResponse.json({ error: "Team Member invitations require a team." }, { status: 400 });
  }
  if (plan !== "team_member" && requestedTeamId) {
    return NextResponse.json({ error: "Only Team Member invitations may assign a team." }, { status: 400 });
  }
  const requestedSponsorId = body.sponsorAgentId ? Number(body.sponsorAgentId) : null;
  if (requestedSponsorId !== null && (!Number.isInteger(requestedSponsorId) || requestedSponsorId <= 0)) {
    return NextResponse.json({ error: "Invalid sponsor" }, { status: 400 });
  }
  const sponsorAgentId = kind === "personal_referral"
    ? authority.agentId
    : authority.session.user.isAdmin
      ? requestedSponsorId
      : requestedSponsorId || authority.agentId;
  if (sponsorAgentId) {
    const [sponsor] = await db
      .select({ id: agents.id, teamId: agents.teamId, accountStatus: agents.accountStatus })
      .from(agents)
      .where(eq(agents.id, sponsorAgentId))
      .limit(1);
    if (!sponsor) return NextResponse.json({ error: "Sponsor not found" }, { status: 404 });
    if (!canAssignInvitationSponsor({
      kind,
      isAdmin: authority.session.user.isAdmin,
      actorAgentId: authority.agentId,
      targetTeamId: requestedTeamId,
      targetTeamLeaderId: selectedTeamLeaderId,
      candidate: sponsor,
    })) {
      return NextResponse.json(
        { error: kind === "team_recruiting"
          ? "Sponsor must be an active member of the selected team."
          : "Sponsor is not eligible for this invitation." },
        { status: 403 },
      );
    }
  }
  const teamCompensationConfig = plan === "team_member" && requestedTeamId
    ? await db
        .select({ id: teamCompensationConfigs.id })
        .from(teamCompensationConfigs)
        .where(and(
          eq(teamCompensationConfigs.teamId, requestedTeamId),
          lte(teamCompensationConfigs.effectiveFrom, new Date().toISOString().slice(0, 10)),
        ))
        .orderBy(desc(teamCompensationConfigs.effectiveFrom), desc(teamCompensationConfigs.version))
        .limit(1)
        .then((rows) => rows[0] || null)
    : null;
  if (plan === "team_member" && !teamCompensationConfig) {
    return NextResponse.json(
      { error: "The selected team has no active compensation terms." },
      { status: 409 },
    );
  }
  const email = typeof body.email === "string" && body.email.trim()
    ? body.email.trim().toLowerCase()
    : null;
  const maxUses = email ? 1 : Math.min(500, Math.max(1, Number(body.maxUses) || 100));
  const days = Math.min(90, Math.max(1, Number(body.expiresInDays) || 30));
  const defaults = defaultInvitationLocks(kind, { teamId: requestedTeamId, sponsorAgentId });
  const requestedLocks = body.locks && typeof body.locks === "object" ? body.locks : null;
  const locks = kind === "admin" && requestedLocks
    ? {
        plan: requestedLocks.plan === undefined ? defaults.plan : Boolean(requestedLocks.plan),
        team: requestedLocks.team === undefined ? defaults.team : Boolean(requestedLocks.team),
        sponsor: requestedLocks.sponsor === undefined ? defaults.sponsor : Boolean(requestedLocks.sponsor),
        term: requestedLocks.term === undefined ? defaults.term : Boolean(requestedLocks.term),
      }
    : defaults;
  const token = createInviteToken();
  const source = cleanOnboardingSource(body.source);
  const [invite] = await db.transaction(async (tx) => {
    const created = await tx.insert(onboardingInvitations).values({
      tokenHash: hashInviteToken(token),
      email,
      kind,
      source,
      teamId: kind === "personal_referral" ? null : requestedTeamId,
      teamCompensationConfigId: teamCompensationConfig?.id || null,
      sponsorAgentId,
      plan,
      affiliationTermMonths: Number(body.affiliationTermMonths) === 24 ? 24 : 12,
      lockPlan: locks.plan,
      lockTeam: locks.team,
      lockSponsor: locks.sponsor,
      lockTerm: locks.term,
      expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
      maxUses,
      createdByAgentId: authority.agentId,
    }).returning();
    await tx.insert(onboardingEvents).values(onboardingEventValues({
      eventType: "invitation_created",
      session: authority.session,
      invitationId: created[0].id,
      teamId: kind === "personal_referral" ? null : requestedTeamId,
      detail: {
        kind,
        source,
        email,
        sponsorAgentId,
        plan,
        teamCompensationConfigId: teamCompensationConfig?.id || null,
        maxUses,
      },
    }));
    return created;
  });
  await logAudit(
    authority.session,
    "create",
    "onboarding_invitation",
    invite.id,
    `Created ${kind} onboarding invitation`,
    { email, teamId: invite.teamId, sponsorAgentId, plan, source, maxUses },
  );
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
  const ownership = authority.session.user.isAdmin
    ? undefined
    : or(
        eq(onboardingInvitations.createdByAgentId, authority.agentId),
        ...(authority.ledTeamIds.length
          ? [and(
              eq(onboardingInvitations.kind, "team_recruiting"),
              inArray(onboardingInvitations.teamId, authority.ledTeamIds),
            )]
          : []),
      );
  const [revoked] = await db.transaction(async (tx) => {
    const rows = await tx.update(onboardingInvitations).set({
      revokedAt: new Date().toISOString(),
    }).where(and(eq(onboardingInvitations.id, id), ownership)).returning({
      id: onboardingInvitations.id,
      teamId: onboardingInvitations.teamId,
      kind: onboardingInvitations.kind,
    });
    if (rows[0]) {
      await tx.insert(onboardingEvents).values(onboardingEventValues({
        eventType: "invitation_revoked",
        session: authority.session,
        invitationId: rows[0].id,
        teamId: rows[0].teamId,
        detail: { kind: rows[0].kind },
      }));
    }
    return rows;
  });
  if (!revoked) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  await logAudit(
    authority.session,
    "revoke",
    "onboarding_invitation",
    revoked.id,
    `Revoked ${revoked.kind} onboarding invitation`,
    { teamId: revoked.teamId },
  );
  return NextResponse.json({ success: true });
}
