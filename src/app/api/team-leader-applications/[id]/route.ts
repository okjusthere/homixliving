import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  onboardingEvents,
  teamCompensationConfigs,
  teamLeaderApplications,
  teams,
} from "@/db/schema";
import { normalizeAgentPlan } from "@/lib/agent-plans";
import { lockOnboardingAgent } from "@/lib/advisory-locks";
import { requireAdminApi } from "@/lib/auth-guards";
import { logAudit } from "@/lib/audit";
import { resolveLicensedCompany } from "@/lib/licensed-companies";
import { notify } from "@/lib/notify";
import { onboardingEventValues } from "@/lib/onboarding-events";
import {
  isTeamCapPreset,
  isTeamSourcedSplitPreset,
  isTeamSplitPreset,
} from "@/lib/team-compensation-policy";
import { teamLeaderApplicationEligibility } from "@/lib/team-leader-applications";

function cleanDecisionInput(body: Record<string, unknown>) {
  const teamName = String(body.teamName || "").trim();
  const defaultTeamSplitPct = Number(body.defaultTeamSplitPct);
  const teamLeadSplitPct = Number(body.teamLeadSplitPct);
  const teamCapCents = body.teamCapCents == null || body.teamCapCents === ""
    ? null
    : Number(body.teamCapCents);
  if (teamName.length < 2 || teamName.length > 100) throw new Error("INVALID_TEAM_NAME");
  if (!isTeamSplitPreset(defaultTeamSplitPct)) throw new Error("INVALID_TEAM_SPLIT");
  if (!isTeamSourcedSplitPreset(teamLeadSplitPct)) throw new Error("INVALID_LEAD_SPLIT");
  if (!isTeamCapPreset(teamCapCents)) throw new Error("INVALID_CAP");
  return {
    teamName,
    defaultTeamSplitPct,
    teamLeadSplitPct,
    teamCapCents,
    decisionReason: String(body.decisionReason || "").trim().slice(0, 1000) || null,
  };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid application" }, { status: 400 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "");
  if (action !== "approve" && action !== "decline") {
    return NextResponse.json({ error: "Action must be approve or decline." }, { status: 400 });
  }

  let decisionInput: ReturnType<typeof cleanDecisionInput> | null = null;
  if (action === "approve") {
    try {
      decisionInput = cleanDecisionInput(body);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const messages: Record<string, string> = {
        INVALID_TEAM_NAME: "Team name must be between 2 and 100 characters.",
        INVALID_TEAM_SPLIT: "Team Split must be 10%, 15%, or 20%.",
        INVALID_LEAD_SPLIT: "Team-sourced Split must be 10%, 15%, 20%, 25%, or 30%.",
        INVALID_CAP: "Invalid Team Cap.",
      };
      return NextResponse.json({ error: messages[code] || "Invalid decision" }, { status: 400 });
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(teamLeaderApplications)
        .where(eq(teamLeaderApplications.id, id))
        .limit(1);
      if (!application) throw new Error("NOT_FOUND");
      await lockOnboardingAgent(tx, application.applicantAgentId);
      const [fresh] = await tx
        .select()
        .from(teamLeaderApplications)
        .where(eq(teamLeaderApplications.id, id))
        .limit(1);
      if (!fresh || fresh.status !== "submitted") throw new Error("ALREADY_DECIDED");
      const now = new Date().toISOString();
      if (action === "decline") {
        const [updated] = await tx.update(teamLeaderApplications).set({
          status: "declined",
          decidedByAgentId: authResult.session.user.agentId || null,
          decisionReason: String(body.decisionReason || "").trim().slice(0, 1000) || null,
          decidedAt: now,
          updatedAt: now,
        }).where(eq(teamLeaderApplications.id, id)).returning();
        await tx.insert(onboardingEvents).values(onboardingEventValues({
          eventType: "team_leader_application_declined",
          session: authResult.session,
          agentId: fresh.applicantAgentId,
          detail: { applicationId: id, reason: updated.decisionReason },
        }));
        return { application: updated, team: null };
      }

      const input = decisionInput!;
      const [duplicateTeam] = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(sql`lower(${teams.name}) = ${input.teamName.toLowerCase()}`)
        .limit(1);
      if (duplicateTeam) throw new Error("TEAM_NAME_EXISTS");
      const [existingLeadership] = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.leaderAgentId, fresh.applicantAgentId))
        .limit(1);
      const [applicant] = await tx
        .select({
          accountStatus: agents.accountStatus,
          agreementStatus: agents.agreementStatus,
          plan: agents.plan,
          licensedCompany: agents.licensedCompany,
          licensedCompanyId: agents.licensedCompanyId,
        })
        .from(agents)
        .where(eq(agents.id, fresh.applicantAgentId))
        .limit(1);
      if (!applicant) throw new Error("NOT_FOUND");
      const licensedCompany = resolveLicensedCompany(
        applicant.licensedCompanyId || applicant.licensedCompany,
      );
      const eligibility = teamLeaderApplicationEligibility({
        accountStatus: applicant.accountStatus,
        agentAgreementStatus: applicant.agreementStatus,
        plan: normalizeAgentPlan(applicant.plan),
        licensedCompanySupported: Boolean(licensedCompany),
        alreadyLeadsTeam: Boolean(existingLeadership),
      });
      if (eligibility) throw new Error("APPLICANT_NOT_ELIGIBLE");
      if (
        licensedCompany!.legalName !== fresh.licensedCompany ||
        (fresh.companyId && licensedCompany!.id !== fresh.companyId)
      ) {
        throw new Error("LICENSED_COMPANY_CHANGED");
      }
      const today = now.slice(0, 10);
      const [team] = await tx.insert(teams).values({
        name: input.teamName,
        companyId: licensedCompany!.id,
        leaderAgentId: fresh.applicantAgentId,
        status: "forming",
        notes: fresh.positioning,
      }).returning();
      const [config] = await tx.insert(teamCompensationConfigs).values({
        teamId: team.id,
        version: 1,
        effectiveFrom: today,
        defaultTeamSplitPct: input.defaultTeamSplitPct,
        teamLeadSplitPct: input.teamLeadSplitPct,
        teamCapCents: input.teamCapCents,
        createdByEmail: authResult.session.user.email || null,
      }).returning();
      const [updated] = await tx.update(teamLeaderApplications).set({
        status: "approved",
        teamId: team.id,
        teamCompensationConfigId: config.id,
        decidedByAgentId: authResult.session.user.agentId || null,
        decisionReason: input.decisionReason,
        decidedAt: now,
        updatedAt: now,
      }).where(and(
        eq(teamLeaderApplications.id, id),
        eq(teamLeaderApplications.status, "submitted"),
      )).returning();
      if (!updated) throw new Error("ALREADY_DECIDED");
      await tx.insert(onboardingEvents).values(onboardingEventValues({
        eventType: "team_leader_application_approved",
        session: authResult.session,
        agentId: fresh.applicantAgentId,
        teamId: team.id,
        detail: {
          applicationId: id,
          teamCompensationConfigId: config.id,
          version: config.version,
          defaultTeamSplitPct: config.defaultTeamSplitPct,
          teamLeadSplitPct: config.teamLeadSplitPct,
          teamCapCents: config.teamCapCents,
        },
      }));
      return { application: updated, team };
    });
    await logAudit(
      authResult.session,
      action,
      "team_leader_application",
      id,
      action === "approve"
        ? `Approved Team Leader application and created ${result.team?.name}`
        : "Declined Team Leader application",
      { teamId: result.team?.id || null, decisionReason: result.application.decisionReason },
    );
    await notify({
      recipientAgentIds: [result.application.applicantAgentId],
      type: "team_leader_application_decision",
      title: action === "approve" ? "Team Leader application approved" : "Team Leader application update",
      body: action === "approve"
        ? "Your forming team is ready. Complete the Team Leader agreement to unlock recruiting."
        : result.application.decisionReason || "Your Team Leader application was not approved.",
      href: action === "approve" ? "/team-workspace" : "/profile",
      dedupeKey: `team-leader-application-decision:${id}:${action}`,
      email: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const mapped: Record<string, [string, number]> = {
      NOT_FOUND: ["Application not found.", 404],
      ALREADY_DECIDED: ["This application has already been decided.", 409],
      TEAM_NAME_EXISTS: ["A team with this name already exists.", 409],
      ALREADY_TEAM_LEADER: ["This applicant already leads a team.", 409],
      APPLICANT_NOT_ELIGIBLE: ["The applicant must still be an active, fully signed Solo Pro agent with a supported licensed company.", 409],
      LICENSED_COMPANY_CHANGED: ["The applicant's licensed company changed after submission. Decline this application and ask them to apply again.", 409],
    };
    if (mapped[code]) {
      return NextResponse.json({ error: mapped[code][0] }, { status: mapped[code][1] });
    }
    console.error("Unable to decide Team Leader application", error);
    return NextResponse.json({ error: "Unable to save decision." }, { status: 500 });
  }
}
