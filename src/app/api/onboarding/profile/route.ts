import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { agents, onboardingInvitations, teams } from "@/db/schema";
import { PLAN_SPLIT_PCT, type AgentPlan } from "@/lib/agent-plans";
import { adminAgentIds, notify } from "@/lib/notify";
import {
  findUsableInvitation,
  ONBOARDING_INVITE_COOKIE,
} from "@/lib/onboarding-invites";

const ONBOARDING_PLANS = new Set<AgentPlan>(["solo", "solo_pro", "team_member", "holding"]);

async function currentAgent() {
  const session = await auth();
  if (!session?.user?.email) return null;
  const email = session.user.email.trim().toLowerCase();
  return db
    .select()
    .from(agents)
    .where(sql`lower(${agents.email}) = ${email}`)
    .limit(1)
    .then((rows) => rows[0] || null);
}

async function currentInvitation(agent: typeof agents.$inferSelect) {
  if (agent.onboardingInviteId) {
    const [invite] = await db
      .select()
      .from(onboardingInvitations)
      .where(eq(onboardingInvitations.id, agent.onboardingInviteId))
      .limit(1);
    return invite || null;
  }
  const token = (await cookies()).get(ONBOARDING_INVITE_COOKIE)?.value;
  return token ? findUsableInvitation(token) : null;
}

function cleanText(value: unknown, max = 160) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, max) : null;
}

export async function GET() {
  const agent = await currentAgent();
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const invitation = await currentInvitation(agent);
  const [teamRows, sponsorRows] = await Promise.all([
    db.select({ id: teams.id, name: teams.name }).from(teams).orderBy(teams.name),
    db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(eq(agents.accountStatus, "active"))
      .orderBy(agents.name),
  ]);
  return NextResponse.json({
    profile: {
      plan: agent.plan,
      teamId: agent.teamId,
      referredByAgentId: agent.referredByAgentId,
      affiliationTermMonths: agent.affiliationTermMonths,
      onboardingCompletedAt: agent.onboardingCompletedAt,
      onboardingStage: agent.onboardingStage,
      agreementStatus: agent.agreementStatus,
      paymentStatus: agent.paymentStatus,
      legalName: agent.legalName,
      phone: agent.phone,
      licenseNumber: agent.licenseNumber,
      licensedCompany: agent.licensedCompany,
      practice: agent.practice,
    },
    routing: invitation ? {
      locked: true,
      source: invitation.source,
      plan: invitation.plan,
      teamId: invitation.teamId,
      referredByAgentId: invitation.sponsorAgentId,
      affiliationTermMonths: invitation.affiliationTermMonths,
    } : { locked: false, source: agent.onboardingSource },
    teams: teamRows,
    sponsors: sponsorRows.filter((row) => row.id !== agent.id),
  });
}

export async function PUT(req: NextRequest) {
  const agent = await currentAgent();
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (agent.accountStatus === "inactive") {
    return NextResponse.json({ error: "Inactive account" }, { status: 403 });
  }
  if (agent.agreementStatus !== "not_started") {
    return NextResponse.json(
      { error: "Onboarding facts are frozen after the agreement is sent." },
      { status: 409 },
    );
  }
  const body = await req.json().catch(() => ({}));
  const invitation = await currentInvitation(agent);
  if (invitation?.email && invitation.email.toLowerCase() !== agent.email.toLowerCase()) {
    return NextResponse.json({ error: "This invitation belongs to another email." }, { status: 403 });
  }
  const plan = (invitation?.plan || String(body.plan || "solo")) as AgentPlan;
  if (!ONBOARDING_PLANS.has(plan)) {
    return NextResponse.json({ error: "Invalid compensation track" }, { status: 400 });
  }
  const teamId = invitation?.teamId ?? (body.teamId ? Number(body.teamId) : null);
  if (plan === "team_member" && !Number.isInteger(teamId)) {
    return NextResponse.json({ error: "Team members must select a team" }, { status: 400 });
  }
  if (teamId) {
    const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  const referredByAgentId = invitation?.sponsorAgentId ?? (
    body.referredByAgentId ? Number(body.referredByAgentId) : null
  );
  if (referredByAgentId === agent.id) {
    return NextResponse.json({ error: "An agent cannot sponsor themselves" }, { status: 400 });
  }
  if (referredByAgentId) {
    const [sponsor] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.id, referredByAgentId))
      .limit(1);
    if (!sponsor) return NextResponse.json({ error: "Sponsor not found" }, { status: 404 });
  }
  const affiliationTermMonths = invitation?.affiliationTermMonths || (plan === "solo_pro"
    ? 12
    : Number(body.affiliationTermMonths) === 24 ? 24 : 12);
  const legalName = cleanText(body.legalName) || agent.legalName || agent.name;
  const phone = cleanText(body.phone, 40) || agent.phone;
  const licenseNumber = cleanText(body.licenseNumber, 80) || agent.licenseNumber;
  const licensedCompany = cleanText(body.licensedCompany, 120) || agent.licensedCompany;
  const practice = body.practice === "rental" || body.practice === "sales" || body.practice === "both"
    ? body.practice
    : agent.practice;
  const now = new Date().toISOString();
  const updated = await db.transaction(async (tx) => {
    if (invitation && !agent.onboardingInviteId) {
      const [consumed] = await tx
        .update(onboardingInvitations)
        .set({ useCount: sql`${onboardingInvitations.useCount} + 1` })
        .where(and(
          eq(onboardingInvitations.id, invitation.id),
          sql`${onboardingInvitations.useCount} < ${onboardingInvitations.maxUses}`,
        ))
        .returning({ id: onboardingInvitations.id });
      if (!consumed) throw new Error("Invitation has already been used.");
    }
    const [row] = await tx
      .update(agents)
      .set({
        legalName,
        phone,
        licenseNumber,
        licensedCompany,
        practice,
        plan,
        splitPct: PLAN_SPLIT_PCT[plan],
        teamId: plan === "team_member" ? teamId : null,
        referredByAgentId,
        affiliationTermMonths,
        planEffectiveFrom: agent.planEffectiveFrom || now.slice(0, 10),
        anniversaryStart: agent.anniversaryStart || agent.joinedAt || now.slice(0, 10),
        onboardingCompletedAt: now,
        onboardingStage: "agreement",
        onboardingSource: invitation?.source || agent.onboardingSource || "direct",
        onboardingInviteId: invitation?.id || agent.onboardingInviteId,
        paymentStatus: agent.paymentStatus,
        updatedAt: now,
      })
      .where(eq(agents.id, agent.id))
      .returning();
    return row;
  }).catch((error) => {
    console.error("Unable to save onboarding profile", error);
    return null;
  });
  if (!updated) {
    return NextResponse.json({ error: "Invitation is no longer available." }, { status: 409 });
  }
  try {
    await notify({
      recipientAgentIds: await adminAgentIds(),
      type: "agent_onboarding_ready",
      title: `入职资料已提交：${agent.name}`,
      body: `${agent.email} 已选择 ${plan}${teamId ? ` · Team #${teamId}` : ""}，下一步为签署协议及缴费。`,
      href: "/agents",
      dedupeKey: `agent-onboarding-ready:${agent.id}:${now.slice(0, 10)}`,
    });
  } catch (error) {
    console.error("onboarding ready notification failed", error);
  }
  return NextResponse.json({ profile: updated });
}
