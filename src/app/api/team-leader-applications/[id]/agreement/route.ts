import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  teamCompensationConfigs,
  teamLeaderApplications,
  teams,
} from "@/db/schema";
import { lockOnboardingAgent } from "@/lib/advisory-locks";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import {
  createESignEnvelope,
  findOrCreateESignTransaction,
  getESignTemplate,
  isTeamLeaderESignConfigured,
  sendESignEnvelope,
  teamLeaderESignTemplateConfiguration,
} from "@/lib/esign";
import {
  OnboardingESignTemplateError,
  validateTeamLeaderESignTemplate,
} from "@/lib/onboarding-esign-policy";
import {
  markTeamLeaderAgreementSent,
  syncTeamLeaderAgreement,
} from "@/lib/team-leader-agreement";

const PREPARATION_STALE_MS = 5 * 60_000;

async function ownedApplication(id: number, agentId: number, isAdmin: boolean) {
  const [row] = await db
    .select({ application: teamLeaderApplications, agent: agents })
    .from(teamLeaderApplications)
    .innerJoin(agents, eq(agents.id, teamLeaderApplications.applicantAgentId))
    .where(and(
      eq(teamLeaderApplications.id, id),
      isAdmin ? undefined : eq(teamLeaderApplications.applicantAgentId, agentId),
    ))
    .limit(1);
  return row || null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;
  const agentId = authResult.session.user.agentId;
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!agentId || !Number.isInteger(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const row = await ownedApplication(id, agentId, authResult.session.user.isAdmin);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const application = await syncTeamLeaderAgreement(row.application, row.application.licensedCompany);
    return NextResponse.json({
      configured: isTeamLeaderESignConfigured(row.application.licensedCompany),
      agreementStatus: application.agreementStatus,
      teamId: application.teamId,
    });
  } catch (error) {
    console.error("Unable to sync Team Leader agreement", error);
    return NextResponse.json({
      configured: isTeamLeaderESignConfigured(row.application.licensedCompany),
      agreementStatus: row.application.agreementStatus,
      syncError: true,
    });
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;
  const agentId = authResult.session.user.agentId;
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!agentId || !Number.isInteger(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const sessionRow = await ownedApplication(id, agentId, false);
  if (!sessionRow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const templateConfiguration = teamLeaderESignTemplateConfiguration(sessionRow.application.licensedCompany);
  if (!templateConfiguration) {
    return NextResponse.json({ error: "Select a supported licensed company before signing." }, { status: 409 });
  }
  if (!isTeamLeaderESignConfigured(sessionRow.application.licensedCompany)) {
    return NextResponse.json({ error: "Team Leader eSign is not configured." }, { status: 503 });
  }

  let row;
  try {
    row = await db.transaction(async (tx) => {
      await lockOnboardingAgent(tx, agentId);
      const [fresh] = await tx
        .select({ application: teamLeaderApplications, agent: agents })
        .from(teamLeaderApplications)
        .innerJoin(agents, eq(agents.id, teamLeaderApplications.applicantAgentId))
        .where(and(
          eq(teamLeaderApplications.id, id),
          eq(teamLeaderApplications.applicantAgentId, agentId),
        ))
        .limit(1);
      if (!fresh || fresh.application.status !== "approved" || !fresh.application.teamId || !fresh.application.teamCompensationConfigId) {
        throw new Error("APPLICATION_NOT_READY");
      }
      if (fresh.application.agreementStatus === "preparing" && !fresh.application.esignEnvelopeId) {
        const updatedAt = new Date(fresh.application.updatedAt).getTime();
        if (Number.isFinite(updatedAt) && Date.now() - updatedAt < PREPARATION_STALE_MS) {
          throw new Error("PREPARING");
        }
      } else if (fresh.application.agreementStatus !== "not_started") {
        return fresh;
      }
      const [claimed] = await tx.update(teamLeaderApplications).set({
        agreementStatus: "preparing",
        updatedAt: new Date().toISOString(),
      }).where(eq(teamLeaderApplications.id, id)).returning();
      return { application: claimed, agent: fresh.agent };
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "APPLICATION_NOT_READY") return NextResponse.json({ error: "Application is not ready for signing." }, { status: 409 });
    if (code === "PREPARING") return NextResponse.json({ error: "Agreement preparation is already in progress." }, { status: 409 });
    console.error("Unable to claim Team Leader agreement preparation", error);
    return NextResponse.json({ error: "Unable to freeze Team Leader agreement facts." }, { status: 500 });
  }

  try {
    if (row.application.esignEnvelopeId) {
      const synced = await syncTeamLeaderAgreement(row.application, row.application.licensedCompany);
      if (synced.agreementStatus === "preparing") {
        await sendESignEnvelope(
          synced.esignEnvelopeId!,
          agentId,
          `homix-team-leader-send-${id}`,
        );
        const sent = await markTeamLeaderAgreementSent(id);
        return NextResponse.json({ success: true, agreementStatus: sent?.agreementStatus || "sent" });
      }
      return NextResponse.json({ success: true, agreementStatus: synced.agreementStatus });
    }
    if (row.application.agreementStatus !== "preparing") {
      return NextResponse.json({ success: true, agreementStatus: row.application.agreementStatus });
    }
    const [team] = await db.select().from(teams).where(eq(teams.id, row.application.teamId!)).limit(1);
    const [terms] = await db.select().from(teamCompensationConfigs).where(eq(
      teamCompensationConfigs.id,
      row.application.teamCompensationConfigId!,
    )).limit(1);
    if (!team || team.status !== "forming" || !terms || terms.teamId !== team.id) {
      throw new OnboardingESignTemplateError("The forming team terms are no longer valid.");
    }
    const template = await getESignTemplate(templateConfiguration.templateId);
    const { version, signerRole, countersignerRoles } = validateTeamLeaderESignTemplate({
      template,
      expectedVersionId: templateConfiguration.templateVersionId,
      expectedSchemaHash: templateConfiguration.templateSchemaHash,
    });
    const countersigner = templateConfiguration.countersignerName && templateConfiguration.countersignerEmail
      ? { name: templateConfiguration.countersignerName, email: templateConfiguration.countersignerEmail }
      : null;
    if (countersignerRoles.length && !countersigner) {
      throw new OnboardingESignTemplateError("The company countersigner is not configured.");
    }
    const transaction = await findOrCreateESignTransaction({
      name: `${row.agent.legalName || row.agent.name} Team Leader agreement`,
      externalReference: `homix-team-leader-${id}`,
    });
    const externalReference = `homix-team-leader-application-${id}`;
    const envelope = await createESignEnvelope({
      transactionId: transaction.id,
      templateId: templateConfiguration.templateId,
      legalEntityName: templateConfiguration.legalEntityName,
      agentId,
      externalReference,
      subject: `${templateConfiguration.legalEntityName} Team Leader agreement`,
      message: `Please review and sign the Team Leader agreement for ${team.name}.`,
      recipients: [
        { roleId: signerRole.id, name: row.agent.legalName || row.agent.name, email: row.agent.email },
        ...countersignerRoles.map((role) => ({ roleId: role.id, name: countersigner!.name, email: countersigner!.email })),
      ],
      mergeData: {
        agent_id: row.agent.id,
        agent_name: row.agent.legalName || row.agent.name,
        agent_email: row.agent.email,
        agent_phone: row.agent.phone || "",
        license_number: row.agent.licenseNumber || "",
        licensed_company: templateConfiguration.legalEntityName,
        compensation_plan: "team_leader",
        team_name: team.name,
        expected_member_count: row.application.expectedMemberCount,
        team_positioning: row.application.positioning,
        team_split_pct: terms.defaultTeamSplitPct,
        team_sourced_split_pct: terms.teamLeadSplitPct,
        team_cap_usd: terms.teamCapCents == null ? "No cap" : terms.teamCapCents / 100,
        team_terms_effective_from: terms.effectiveFrom,
      },
      expectedTemplateVersionId: version.id,
      expectedTemplateSchemaHash: version.schemaHash!,
    });
    await db.update(teamLeaderApplications).set({
      esignTransactionId: transaction.id,
      esignEnvelopeId: envelope.id,
      esignTemplateVersionId: envelope.templateVersionId,
      agreementStatus: "preparing",
      updatedAt: new Date().toISOString(),
    }).where(eq(teamLeaderApplications.id, id));
    await sendESignEnvelope(envelope.id, agentId, `homix-team-leader-send-${id}`);
    await markTeamLeaderAgreementSent(id);
    return NextResponse.json({ success: true, agreementStatus: "sent" });
  } catch (error) {
    await db.update(teamLeaderApplications).set({
      agreementStatus: "not_started",
      updatedAt: new Date().toISOString(),
    }).where(and(
      eq(teamLeaderApplications.id, id),
      eq(teamLeaderApplications.agreementStatus, "preparing"),
      isNull(teamLeaderApplications.esignEnvelopeId),
    )).catch(() => undefined);
    if (error instanceof OnboardingESignTemplateError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Unable to prepare Team Leader agreement", error);
    return NextResponse.json({ error: "Unable to prepare Team Leader agreement." }, { status: 502 });
  }
}
