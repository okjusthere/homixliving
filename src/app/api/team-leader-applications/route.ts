import { after, NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  onboardingEvents,
  teamLeaderApplications,
  teams,
} from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { lockOnboardingAgent } from "@/lib/advisory-locks";
import { normalizeAgentPlan } from "@/lib/agent-plans";
import { logAudit } from "@/lib/audit";
import { resolveLicensedCompany } from "@/lib/licensed-companies";
import { adminAgentIds, notify } from "@/lib/notify";
import { onboardingEventValues } from "@/lib/onboarding-events";
import {
  teamLeaderApplicationEligibility,
  validateTeamLeaderApplicationInput,
} from "@/lib/team-leader-applications";

const OPEN_STATUSES = ["submitted", "approved"] as const;

export async function GET() {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;
  const agentId = authResult.session.user.agentId;
  if (!agentId) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const rows = await db
    .select({
      application: teamLeaderApplications,
      applicantName: agents.name,
      applicantEmail: agents.email,
      applicantCompany: teamLeaderApplications.licensedCompany,
      teamName: teams.name,
      teamStatus: teams.status,
    })
    .from(teamLeaderApplications)
    .innerJoin(agents, eq(agents.id, teamLeaderApplications.applicantAgentId))
    .leftJoin(teams, eq(teams.id, teamLeaderApplications.teamId))
    .where(authResult.session.user.isAdmin
      ? undefined
      : eq(teamLeaderApplications.applicantAgentId, agentId))
    .orderBy(desc(teamLeaderApplications.createdAt));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;
  const agentId = authResult.session.user.agentId;
  if (!agentId) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  let input;
  try {
    input = validateTeamLeaderApplicationInput(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid application" },
      { status: 400 },
    );
  }

  try {
    const application = await db.transaction(async (tx) => {
      await lockOnboardingAgent(tx, agentId);
      const [agent] = await tx.select().from(agents).where(eq(agents.id, agentId)).limit(1);
      if (!agent) throw new Error("AGENT_NOT_FOUND");
      const [leadership] = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.leaderAgentId, agentId))
        .limit(1);
      const [openApplication] = await tx
        .select({ status: teamLeaderApplications.status })
        .from(teamLeaderApplications)
        .where(and(
          eq(teamLeaderApplications.applicantAgentId, agentId),
          inArray(teamLeaderApplications.status, [...OPEN_STATUSES]),
        ))
        .limit(1);
      const licensedCompany = resolveLicensedCompany(agent.licensedCompanyId || agent.licensedCompany);
      const ineligible = teamLeaderApplicationEligibility({
        accountStatus: agent.accountStatus,
        agentAgreementStatus: agent.agreementStatus,
        plan: normalizeAgentPlan(agent.plan),
        licensedCompanySupported: Boolean(licensedCompany),
        alreadyLeadsTeam: Boolean(leadership),
        openApplicationStatus: openApplication?.status,
      });
      if (ineligible) throw new Error(ineligible);
      const [created] = await tx.insert(teamLeaderApplications).values({
        applicantAgentId: agentId,
        licensedCompany: licensedCompany!.legalName,
        companyId: licensedCompany!.id,
        ...input,
      }).returning();
      await tx.insert(onboardingEvents).values(onboardingEventValues({
        eventType: "team_leader_application_submitted",
        session: authResult.session,
        agentId,
        detail: {
          applicationId: created.id,
          proposedTeamName: input.proposedTeamName,
          expectedMemberCount: input.expectedMemberCount,
          proposedTeamSplitPct: input.proposedTeamSplitPct,
        },
      }));
      return created;
    });
    await logAudit(
      authResult.session,
      "submit",
      "team_leader_application",
      application.id,
      `Submitted Team Leader application for ${application.proposedTeamName}`,
    );
    after(async () => {
      await notify({
        recipientAgentIds: await adminAgentIds(),
        type: "team_leader_application",
        title: `Team Leader application: ${application.proposedTeamName}`,
        body: `${authResult.session.user.name || authResult.session.user.email} submitted a Team Leader application.`,
        href: "/teams",
        dedupeKey: `team-leader-application:${application.id}`,
        email: true,
      });
    });
    return NextResponse.json(application, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const messages: Record<string, string> = {
      AGENT_NOT_FOUND: "Agent not found.",
      account_not_active: "Only active agents may apply.",
      agent_agreement_required: "Complete your Agent Affiliation Agreement before applying.",
      solo_pro_required: "The Solo Pro plan is required before applying.",
      licensed_company_required: "Select Homix Realty Inc. or Homix Living Inc. before applying.",
      already_team_leader: "You already lead a team.",
      application_already_open: "You already have an open Team Leader application.",
    };
    if (messages[code]) return NextResponse.json({ error: messages[code] }, { status: 409 });
    console.error("Unable to submit Team Leader application", error);
    return NextResponse.json({ error: "Unable to submit application." }, { status: 500 });
  }
}
