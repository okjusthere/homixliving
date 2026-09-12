import { NextResponse } from "next/server";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  agents,
  commerceOrders,
  onboardingInvitations,
  teamCompensationConfigs,
  teamJoinRequests,
  teams,
} from "@/db/schema";
import {
  findOrCreateESignEnvelope,
  ensureESignEnvelopeReplaceable,
  ESignApiError,
  findOrCreateESignTransaction,
  getESignTemplate,
  isOnboardingESignConfigured,
  onboardingESignTemplateConfiguration,
  sendESignEnvelope,
} from "@/lib/esign";
import { lockOnboardingAgent } from "@/lib/advisory-locks";
import { normalizeAgentPlan, PLAN_LABELS, PLAN_SPLIT_PCT } from "@/lib/agent-plans";
import { onboardingPaymentProduct } from "@/lib/onboarding";
import { syncOnboardingAgreement } from "@/lib/onboarding-agreement";
import {
  OnboardingESignTemplateError,
  validateOnboardingESignTemplate,
} from "@/lib/onboarding-esign-policy";
import { hasPreapprovedTeamRouting } from "@/lib/team-join-requests";

import { canRestartAgreement } from "@/lib/agreement-recovery-policy";
import { AgreementAttemptChanged, agreementAttemptReference, claimAgreementAttempt, withAgreementAttempt, type AgreementAttempt } from "@/lib/agreement-attempts";

const PREPARATION_STALE_MS = 5 * 60_000;

class AgreementPreparationConflict extends Error {}

async function currentAgent() {
  const session = await auth();
  if (!session?.user?.agentId) return null;
  const [agent] = await db.select().from(agents).where(eq(agents.id, session.user.agentId)).limit(1);
  return agent || null;
}

async function claimAgreementPreparation(agentId: number, restartEnvelopeId?: string) {
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
    if (fresh.plan === "team_member") {
      if (!fresh.teamId || !fresh.teamTermsConfigId) {
        throw new AgreementPreparationConflict(
          "Team Leader approval is required before preparing the agreement.",
        );
      }
      const [acceptedRequest] = await tx
        .select({ id: teamJoinRequests.id })
        .from(teamJoinRequests)
        .where(and(
          eq(teamJoinRequests.agentId, fresh.id),
          eq(teamJoinRequests.teamId, fresh.teamId),
          eq(teamJoinRequests.acceptedConfigId, fresh.teamTermsConfigId),
          eq(teamJoinRequests.status, "accepted"),
        ))
        .limit(1);
      const [invitation] = fresh.onboardingInviteId
        ? await tx
            .select()
            .from(onboardingInvitations)
            .where(eq(onboardingInvitations.id, fresh.onboardingInviteId))
            .limit(1)
        : [];
      if (!acceptedRequest && !hasPreapprovedTeamRouting(invitation, fresh.teamId)) {
        throw new AgreementPreparationConflict(
          "Team Leader approval is required before preparing the agreement.",
        );
      }
    }

    const replacing = Boolean(restartEnvelopeId);
    if (replacing && (fresh.esignEnvelopeId !== restartEnvelopeId || !canRestartAgreement(fresh.agreementStatus))) {
      throw new AgreementPreparationConflict("The agreement changed. Refresh before trying again.");
    }
    if (!replacing && fresh.agreementStatus === "preparing" && !fresh.esignEnvelopeId) {
      const updatedAt = fresh.updatedAt ? new Date(fresh.updatedAt).getTime() : Number.NaN;
      if (Number.isFinite(updatedAt) && Date.now() - updatedAt < PREPARATION_STALE_MS) {
        throw new AgreementPreparationConflict("The onboarding agreement is already being prepared.");
      }
    } else if (!replacing && fresh.agreementStatus !== "not_started") {
      return { agent: fresh, attempt: null };
    }

    const attempt = await claimAgreementAttempt(tx, { scope: "onboarding", subjectId: agentId, agentId }, replacing ? {
      envelopeId: fresh.esignEnvelopeId, transactionId: fresh.esignTransactionId,
      templateVersionId: fresh.esignTemplateVersionId, evidencePackageId: fresh.esignEvidencePackageId,
      status: fresh.agreementStatus, agentSignedAt: fresh.agreementAgentSignedAt,
      countersignedAt: fresh.agreementCountersignedAt, completedAt: fresh.agreementCompletedAt,
    } : undefined);
    const [claimed] = await tx
      .update(agents)
      .set({
        ...(replacing ? {
          esignEnvelopeId: null, esignTransactionId: null, esignTemplateVersionId: null,
          esignEvidencePackageId: null, agreementAgentSignedAt: null,
          agreementCountersignedAt: null, agreementCompletedAt: null, teamTermsAcceptedAt: null,
        } : {}),
        agreementStatus: "preparing",
        onboardingStage: "agreement",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agents.id, agentId))
      .returning();
    return { agent: claimed, attempt };
  });
}

async function releaseFailedPreparation(agentId: number, attempt: AgreementAttempt | null) {
  if (!attempt) return;
  await withAgreementAttempt({ scope: "onboarding", subjectId: agentId, agentId }, attempt.id, async (tx) => {
    // Keep the facts frozen and the attempt ID stable after an uncertain remote
    // response, but release its lease so an explicit retry can recover it.
    await tx.update(agents).set({ updatedAt: new Date(Date.now() - PREPARATION_STALE_MS).toISOString() }).where(and(
      eq(agents.id, agentId), eq(agents.agreementStatus, "preparing"), isNull(agents.esignEnvelopeId),
    ));
  });
}

export async function GET() {
  const agent = await currentAgent();
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [payment] = await db.select({ channel: commerceOrders.paymentChannel }).from(commerceOrders).where(and(eq(commerceOrders.agentId, agent.id), gt(commerceOrders.licenseTransferFeeCents, 0), inArray(commerceOrders.status, ["paid", "active"]))).orderBy(desc(commerceOrders.paidAt), desc(commerceOrders.id)).limit(1);
  try {
    const synced = await syncOnboardingAgreement(agent);
    return NextResponse.json({
      configured: isOnboardingESignConfigured(
        agent.licensedCompany,
        agent.plan,
        agent.liborMembershipStatus,
      ),
      agreementStatus: synced.agreementStatus,
      agreementAgentSignedAt: synced.agreementAgentSignedAt,
      agreementCountersignedAt: synced.agreementCountersignedAt,
      onboardingStage: synced.onboardingStage,
      paymentStatus: synced.paymentStatus,
      paymentChannel: payment?.channel || null,
      paymentProduct: onboardingPaymentProduct(synced.plan, synced.affiliationTermMonths),
    });
  } catch (error) {
    console.error("Unable to sync onboarding agreement", error);
    return NextResponse.json({
      configured: isOnboardingESignConfigured(
        agent.licensedCompany,
        agent.plan,
        agent.liborMembershipStatus,
      ),
      agreementStatus: agent.agreementStatus,
      agreementAgentSignedAt: agent.agreementAgentSignedAt,
      agreementCountersignedAt: agent.agreementCountersignedAt,
      onboardingStage: agent.onboardingStage,
      paymentStatus: agent.paymentStatus,
      paymentChannel: payment?.channel || null,
      paymentProduct: onboardingPaymentProduct(agent.plan, agent.affiliationTermMonths),
      syncError: true,
    });
  }
}

export async function POST() {
  const sessionAgent = await currentAgent();
  if (!sessionAgent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionTemplateConfiguration = onboardingESignTemplateConfiguration(
    sessionAgent.licensedCompany,
    sessionAgent.plan,
    sessionAgent.liborMembershipStatus,
  );
  if (!sessionTemplateConfiguration) {
    const error = sessionAgent.licensedCompany === "homix_realty" &&
      !sessionAgent.liborMembershipStatus
      ? "Confirm whether you need a new LIBOR membership before preparing the agreement."
      : "Select a licensed company and compensation plan before preparing the agreement.";
    return NextResponse.json(
      { error },
      { status: 409 },
    );
  }
  if (!isOnboardingESignConfigured(
    sessionAgent.licensedCompany,
    sessionAgent.plan,
    sessionAgent.liborMembershipStatus,
  )) {
    return NextResponse.json({ error: "eSign onboarding is not configured." }, { status: 503 });
  }
  let agent: typeof agents.$inferSelect;
  let attempt: AgreementAttempt | null = null;
  try {
    ({ agent, attempt } = await claimAgreementPreparation(sessionAgent.id));
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
      if (synced.esignEnvelopeId !== agent.esignEnvelopeId) {
        return NextResponse.json({ error: "The agreement changed. Refresh its status." }, { status: 409 });
      }
      if (canRestartAgreement(synced.agreementStatus)) {
        await ensureESignEnvelopeReplaceable(synced.esignEnvelopeId!);
        ({ agent, attempt } = await claimAgreementPreparation(agent.id, synced.esignEnvelopeId!));
      } else {
        if (synced.agreementStatus === "failed") {
          return NextResponse.json({ error: "The signed PDF needs recovery. Contact an administrator; your signatures are retained." }, { status: 409 });
        }
        if (synced.agreementStatus === "preparing") {
          await sendESignEnvelope(agent.esignEnvelopeId, agent.id, `homix-onboarding-send-${agent.esignEnvelopeId}`);
          await db.update(agents).set({ agreementStatus: "sent", onboardingStage: "agreement", updatedAt: new Date().toISOString() })
            .where(and(eq(agents.id, agent.id), eq(agents.esignEnvelopeId, agent.esignEnvelopeId), eq(agents.agreementStatus, "preparing")));
        }
        return NextResponse.json({ success: true, agreementStatus: synced.agreementStatus === "preparing" ? "sent" : synced.agreementStatus });
      }
    }
    if (agent.agreementStatus !== "preparing") {
      return NextResponse.json({ success: true, agreementStatus: agent.agreementStatus });
    }

    const templateConfiguration = onboardingESignTemplateConfiguration(
      agent.licensedCompany,
      agent.plan,
      agent.liborMembershipStatus,
    );
    if (!templateConfiguration) {
      throw new OnboardingESignTemplateError(
        "The licensed company does not have an approved onboarding agreement.",
      );
    }
    if (!attempt) throw new AgreementPreparationConflict("Agreement preparation has changed.");
    const templateId = templateConfiguration.templateId;
    const template = await getESignTemplate(templateId);
    const effectivePlan = normalizeAgentPlan(agent.plan);
    const { version, signerRole, countersignerRoles } = validateOnboardingESignTemplate({
      template,
      expectedVersionId: templateConfiguration.templateVersionId,
      expectedSchemaHash: templateConfiguration.templateSchemaHash,
      includeTeamTerms: effectivePlan === "team_member",
      entityKey: templateConfiguration.entityKey,
      liborMembershipStatus: agent.liborMembershipStatus,
    });
    const countersigner = templateConfiguration.countersignerName &&
      templateConfiguration.countersignerEmail
      ? {
          name: templateConfiguration.countersignerName,
          email: templateConfiguration.countersignerEmail,
        }
      : null;
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
    if (effectivePlan === "team_member" && (!teamTerms || teamTerms.teamId !== agent.teamId)) {
      throw new OnboardingESignTemplateError(
        "Team compensation terms must be selected before preparing the agreement.",
      );
    }
    const transaction = await findOrCreateESignTransaction({
      name: `${agent.legalName || agent.name} onboarding`,
      externalReference: `homix-agent-${agent.id}-template-${version.id}`,
    });
    const recipients = [
      { roleId: signerRole.id, name: agent.legalName || agent.name, email: agent.email },
      ...countersignerRoles.map((role) => ({
        roleId: role.id,
        name: countersigner!.name,
        email: countersigner!.email,
      })),
    ];
    const envelope = await findOrCreateESignEnvelope({
      transactionId: transaction.id,
      templateId,
      legalEntityName: templateConfiguration.legalEntityName,
      agentId: agent.id,
      recipients,
      mergeData: {
        agent_id: agent.id,
        agent_name: agent.legalName || agent.name,
        agent_email: agent.email,
        agent_phone: agent.phone || "",
        license_number: agent.licenseNumber || "",
        licensed_company: templateConfiguration.legalEntityName,
        practice: agent.practice || "",
        compensation_plan: PLAN_LABELS.en[effectivePlan],
        split_pct: `${PLAN_SPLIT_PCT[effectivePlan]}%`,
        team_name: team?.name || "",
        team_split_pct: teamTerms ? `${teamTerms.defaultTeamSplitPct}%` : "",
        team_sourced_split_pct: teamTerms ? `${teamTerms.teamLeadSplitPct}%` : "",
        team_cap_usd: teamTerms
          ? teamTerms.teamCapCents == null
            ? "No cap"
            : `$${(teamTerms.teamCapCents / 100).toLocaleString("en-US")}`
          : "",
        team_terms_effective_from: teamTerms ? agent.teamTermsEffectiveFrom || "" : "",
        sponsor_name: sponsor?.name || "",
        affiliation_term_months: agent.affiliationTermMonths || 12,
        ...(templateConfiguration.entityKey === "homix_realty" ? {
          libor_membership_status: agent.liborMembershipStatus === "existing_member"
            ? "Existing LIBOR member - new membership application not required"
            : "New LIBOR membership application required",
          libor_office_name: "Homix Realty Inc.",
          libor_office_address: "37-20 Prince St, STE 3H",
          libor_office_town: "Flushing",
          libor_office_state: "NY",
          libor_office_zip: "11354",
          libor_office_phone: "(929) 666-9886",
          libor_office_fax: "",
          libor_office_email: "sunnyz@homixny.com",
          libor_office_web: "www.homixny.com",
        } : {}),
      },
      expectedTemplateVersionId: version.id,
      expectedTemplateSchemaHash: version.schemaHash!,
      externalReference: agreementAttemptReference(`homix-onboarding-agent-${agent.id}-template-${version.id}`, attempt),
      expiresAt: attempt.expiresAt,
    });
    if (envelope.templateVersionId !== version.id) {
      throw new OnboardingESignTemplateError(
        "eSign created the envelope from an unapproved template version.",
      );
    }
    await withAgreementAttempt({ scope: "onboarding", subjectId: agent.id, agentId: agent.id }, attempt.id, async (tx) => {
      await tx.update(agents).set({
        esignTransactionId: transaction.id,
        esignEnvelopeId: envelope.id,
        esignTemplateVersionId: envelope.templateVersionId,
        agreementStatus: "preparing",
        onboardingStage: "agreement",
        updatedAt: new Date().toISOString(),
      }).where(and(eq(agents.id, agent.id), isNull(agents.esignEnvelopeId)));
    });
    await sendESignEnvelope(
      envelope.id,
      agent.id,
      `homix-onboarding-send-${envelope.id}`,
    );
    await db.update(agents).set({
      agreementStatus: "sent",
      updatedAt: new Date().toISOString(),
    }).where(and(eq(agents.id, agent.id), eq(agents.esignEnvelopeId, envelope.id), eq(agents.agreementStatus, "preparing")));
    return NextResponse.json({ success: true, agreementStatus: "sent" });
  } catch (error) {
    await releaseFailedPreparation(agent.id, attempt).catch((releaseError) => {
      console.error("Unable to release failed onboarding preparation", releaseError);
    });
    if (error instanceof OnboardingESignTemplateError || error instanceof AgreementPreparationConflict || error instanceof AgreementAttemptChanged || (error instanceof ESignApiError && error.status === 409)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Unable to create onboarding agreement", error);
    return NextResponse.json({ error: "Unable to prepare the onboarding agreement." }, { status: 502 });
  }
}
