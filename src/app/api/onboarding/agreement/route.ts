import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
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
  onboardingESignTemplatePin,
  sendESignEnvelope,
} from "@/lib/esign";
import { lockOnboardingAgent } from "@/lib/advisory-locks";
import { onboardingPaymentProduct } from "@/lib/onboarding";
import { syncOnboardingAgreement } from "@/lib/onboarding-agreement";
import {
  OnboardingESignTemplateError,
  validateOnboardingESignTemplate,
} from "@/lib/onboarding-esign-policy";

const PREPARATION_STALE_MS = 5 * 60_000;

class AgreementPreparationConflict extends Error {}

async function currentAgent() {
  const session = await auth();
  if (!session?.user?.agentId) return null;
  const [agent] = await db.select().from(agents).where(eq(agents.id, session.user.agentId)).limit(1);
  return agent || null;
}

async function claimAgreementPreparation(agentId: number) {
  return db.transaction(async (tx) => {
    await lockOnboardingAgent(tx, agentId);
    const [fresh] = await tx.select().from(agents).where(eq(agents.id, agentId)).limit(1);
    if (!fresh) throw new AgreementPreparationConflict("Agent no longer exists.");
    if (fresh.accountStatus !== "pending") {
      throw new AgreementPreparationConflict("Onboarding is only available to pending accounts.");
    }
    if (!fresh.onboardingCompletedAt) {
      throw new AgreementPreparationConflict("Complete the onboarding profile first.");
    }

    if (fresh.agreementStatus === "preparing" && !fresh.esignEnvelopeId) {
      const updatedAt = fresh.updatedAt ? new Date(fresh.updatedAt).getTime() : Number.NaN;
      if (Number.isFinite(updatedAt) && Date.now() - updatedAt < PREPARATION_STALE_MS) {
        throw new AgreementPreparationConflict("The onboarding agreement is already being prepared.");
      }
    } else if (fresh.agreementStatus !== "not_started") {
      return fresh;
    }

    const [claimed] = await tx
      .update(agents)
      .set({
        agreementStatus: "preparing",
        onboardingStage: "agreement",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agents.id, agentId))
      .returning();
    return claimed;
  });
}

async function releaseFailedPreparation(agentId: number) {
  await db
    .update(agents)
    .set({ agreementStatus: "not_started", updatedAt: new Date().toISOString() })
    .where(and(
      eq(agents.id, agentId),
      eq(agents.agreementStatus, "preparing"),
      isNull(agents.esignEnvelopeId),
    ));
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
  const sessionAgent = await currentAgent();
  if (!sessionAgent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOnboardingESignConfigured()) {
    return NextResponse.json({ error: "eSign onboarding is not configured." }, { status: 503 });
  }
  let agent;
  try {
    agent = await claimAgreementPreparation(sessionAgent.id);
  } catch (error) {
    if (error instanceof AgreementPreparationConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Unable to freeze onboarding facts", error);
    return NextResponse.json({ error: "Unable to freeze onboarding facts." }, { status: 500 });
  }
  try {
    if (agent.esignEnvelopeId) {
      const synced = await syncOnboardingAgreement(agent);
      if (synced.agreementStatus === "preparing") {
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
    if (agent.agreementStatus !== "preparing") {
      return NextResponse.json({ success: true, agreementStatus: agent.agreementStatus });
    }

    const templateId = onboardingESignTemplateId();
    const templatePin = onboardingESignTemplatePin();
    const template = await getESignTemplate(templateId);
    const { version, signerRole, countersignerRoles } = validateOnboardingESignTemplate({
      template,
      expectedVersionId: templatePin.versionId,
      expectedSchemaHash: templatePin.schemaHash,
      includeTeamTerms: agent.plan === "team_member",
    });
    const countersigner = countersignerRoles.length ? onboardingESignCountersigner() : null;
    if (countersignerRoles.length && !countersigner) {
      throw new OnboardingESignTemplateError(
        "The company countersigner is not configured.",
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
      throw new OnboardingESignTemplateError(
        "Team compensation terms must be selected before preparing the agreement.",
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
      expectedTemplateVersionId: version.id,
      expectedTemplateSchemaHash: version.schemaHash!,
    });
    if (envelope.templateVersionId !== version.id) {
      throw new OnboardingESignTemplateError(
        "eSign created the envelope from an unapproved template version.",
      );
    }
    await db.update(agents).set({
      esignTransactionId: transaction.id,
      esignEnvelopeId: envelope.id,
      esignTemplateVersionId: envelope.templateVersionId,
      agreementStatus: "preparing",
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
    await releaseFailedPreparation(agent.id).catch((releaseError) => {
      console.error("Unable to release failed onboarding preparation", releaseError);
    });
    if (error instanceof OnboardingESignTemplateError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Unable to create onboarding agreement", error);
    return NextResponse.json({ error: "Unable to prepare the onboarding agreement." }, { status: 502 });
  }
}
