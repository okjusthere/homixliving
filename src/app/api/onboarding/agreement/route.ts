import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { agents, teamCompensationConfigs, teams } from "@/db/schema";
import {
  createESignEnvelope,
  findOrCreateESignTransaction,
  getESignTemplate,
  isOnboardingESignConfigured,
  onboardingESignCountersigner,
  onboardingESignTemplateId,
  sendESignEnvelope,
} from "@/lib/esign";
import { onboardingPaymentProduct } from "@/lib/onboarding";
import { syncOnboardingAgreement } from "@/lib/onboarding-agreement";

async function currentAgent() {
  const session = await auth();
  if (!session?.user?.agentId) return null;
  const [agent] = await db.select().from(agents).where(eq(agents.id, session.user.agentId)).limit(1);
  return agent || null;
}

export async function GET() {
  const agent = await currentAgent();
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const synced = await syncOnboardingAgreement(agent);
    return NextResponse.json({
      configured: isOnboardingESignConfigured(),
      agreementStatus: synced.agreementStatus,
      onboardingStage: synced.onboardingStage,
      paymentStatus: synced.paymentStatus,
      paymentProduct: onboardingPaymentProduct(synced.plan, synced.affiliationTermMonths),
    });
  } catch (error) {
    console.error("Unable to sync onboarding agreement", error);
    return NextResponse.json({
      configured: isOnboardingESignConfigured(),
      agreementStatus: agent.agreementStatus,
      onboardingStage: agent.onboardingStage,
      paymentStatus: agent.paymentStatus,
      paymentProduct: onboardingPaymentProduct(agent.plan, agent.affiliationTermMonths),
      syncError: true,
    });
  }
}

export async function POST() {
  const agent = await currentAgent();
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (agent.accountStatus !== "pending") {
    return NextResponse.json({ error: "Onboarding is only available to pending accounts." }, { status: 409 });
  }
  if (!isOnboardingESignConfigured()) {
    return NextResponse.json({ error: "eSign onboarding is not configured." }, { status: 503 });
  }
  if (!agent.onboardingCompletedAt) {
    return NextResponse.json({ error: "Complete the onboarding profile first." }, { status: 409 });
  }
  try {
    if (agent.esignEnvelopeId) {
      const synced = await syncOnboardingAgreement(agent);
      if (synced.agreementStatus === "not_started") {
        await sendESignEnvelope(agent.esignEnvelopeId, agent.id);
        await db.update(agents).set({
          agreementStatus: "sent",
          onboardingStage: "agreement",
          updatedAt: new Date().toISOString(),
        }).where(eq(agents.id, agent.id));
        return NextResponse.json({ success: true, agreementStatus: "sent" });
      }
      return NextResponse.json({ success: true, agreementStatus: synced.agreementStatus });
    }

    const templateId = onboardingESignTemplateId();
    const template = await getESignTemplate(templateId);
    const version = template.versions.find((candidate) => candidate.id === template.activeVersionId);
    if (!version || version.status !== "PUBLISHED") {
      return NextResponse.json({ error: "The onboarding template is not published." }, { status: 409 });
    }
    if (version.approvalRequired) {
      return NextResponse.json({ error: "The onboarding template must not require preparer approval." }, { status: 409 });
    }
    const signerRoles = version.roles.filter((role) => role.kind === "signer");
    if (signerRoles.length !== 1) {
      return NextResponse.json(
        { error: "The onboarding template must contain exactly one agent signer role." },
        { status: 409 },
      );
    }
    const [signerRole] = signerRoles;
    const countersignerRoles = version.roles.filter((role) => role.kind === "countersigner");
    if (countersignerRoles.length > 1) {
      return NextResponse.json(
        { error: "The onboarding template may contain at most one company countersigner role." },
        { status: 409 },
      );
    }
    const unsupportedRoles = version.roles.filter(
      (role) => role.kind !== "signer" && role.kind !== "countersigner",
    );
    if (unsupportedRoles.length > 0) {
      return NextResponse.json(
        { error: "The onboarding template contains unsupported recipient roles." },
        { status: 409 },
      );
    }
    const countersigner = countersignerRoles.length ? onboardingESignCountersigner() : null;
    if (countersignerRoles.length && !countersigner) {
      return NextResponse.json(
        { error: "The company countersigner is not configured." },
        { status: 503 },
      );
    }
    const [team] = agent.teamId
      ? await db.select({ name: teams.name }).from(teams).where(eq(teams.id, agent.teamId)).limit(1)
      : [];
    const [sponsor] = agent.referredByAgentId
      ? await db.select({ name: agents.name }).from(agents).where(eq(agents.id, agent.referredByAgentId)).limit(1)
      : [];
    const [teamTerms] = agent.teamTermsConfigId
      ? await db
          .select()
          .from(teamCompensationConfigs)
          .where(eq(teamCompensationConfigs.id, agent.teamTermsConfigId))
          .limit(1)
      : [];
    if (agent.plan === "team_member" && (!teamTerms || teamTerms.teamId !== agent.teamId)) {
      return NextResponse.json(
        { error: "Team compensation terms must be selected before preparing the agreement." },
        { status: 409 },
      );
    }
    const transaction = await findOrCreateESignTransaction({
      name: `${agent.legalName || agent.name} onboarding`,
      externalReference: `homix-agent-${agent.id}`,
    });
    await db.update(agents).set({
      esignTransactionId: transaction.id,
      updatedAt: new Date().toISOString(),
    }).where(eq(agents.id, agent.id));
    const recipients = [
      { roleId: signerRole.id, name: agent.legalName || agent.name, email: agent.email },
      ...countersignerRoles.map((role) => ({
        roleId: role.id,
        name: countersigner!.name,
        email: countersigner!.email,
      })),
    ];
    const envelope = await createESignEnvelope({
      transactionId: transaction.id,
      templateId,
      agentId: agent.id,
      recipients,
      mergeData: {
        agent_id: agent.id,
        agent_name: agent.legalName || agent.name,
        agent_email: agent.email,
        agent_phone: agent.phone || "",
        license_number: agent.licenseNumber || "",
        licensed_company: agent.licensedCompany || "",
        compensation_plan: agent.plan,
        split_pct: agent.splitPct,
        team_name: team?.name || "",
        team_split_pct: teamTerms?.defaultTeamSplitPct ?? "",
        team_sourced_split_pct: teamTerms?.teamLeadSplitPct ?? "",
        team_cap_usd: teamTerms?.teamCapCents == null ? "No cap" : teamTerms.teamCapCents / 100,
        team_terms_effective_from: agent.teamTermsEffectiveFrom || "",
        sponsor_name: sponsor?.name || "",
        affiliation_term_months: agent.affiliationTermMonths || 12,
      },
    });
    await db.update(agents).set({
      esignTransactionId: transaction.id,
      esignEnvelopeId: envelope.id,
      esignTemplateVersionId: envelope.templateVersionId,
      agreementStatus: "not_started",
      onboardingStage: "agreement",
      updatedAt: new Date().toISOString(),
    }).where(eq(agents.id, agent.id));
    await sendESignEnvelope(envelope.id, agent.id);
    await db.update(agents).set({
      agreementStatus: "sent",
      updatedAt: new Date().toISOString(),
    }).where(eq(agents.id, agent.id));
    return NextResponse.json({ success: true, agreementStatus: "sent" });
  } catch (error) {
    console.error("Unable to create onboarding agreement", error);
    return NextResponse.json({ error: "Unable to prepare the onboarding agreement." }, { status: 502 });
  }
}
