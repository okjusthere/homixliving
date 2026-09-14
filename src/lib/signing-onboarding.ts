import "server-only";
import { requireLegalName } from "@/lib/signing-agent-names";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  onboardingEvents,
  onboardingInvitations,
  teamCompensationConfigs,
  teamJoinRequests,
  teams,
  type SigningPreparation,
} from "@/db/schema";
import { lockOnboardingAgent, type DbTransaction } from "@/lib/advisory-locks";
import {
  normalizeAgentPlan,
  PLAN_LABELS,
  PLAN_SPLIT_PCT,
} from "@/lib/agent-plans";
import { resolveLicensedCompany } from "@/lib/licensed-companies";
import { hasPreapprovedTeamRouting } from "@/lib/team-join-requests";
import {
  signingBridgeJson,
  signingSystemActor,
  SigningBridgeError,
} from "@/lib/signing-bridge";
import {
  signingPackageSchema,
  signingRequestSchema,
  type SigningPackage,
} from "@/lib/signing-contract";
import { hrSigningProgress } from "@/lib/signing-hr-projection";
import { onboardingPaymentProduct } from "@/lib/onboarding";
import { verifiedManualContract } from "@/lib/onboarding-requirements";
import { onboardingEventValues } from "@/lib/onboarding-events";

type Agent = typeof agents.$inferSelect;
export function onboardingSigningContextHash(agent: Agent) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        company: resolveLicensedCompany(
          agent.licensedCompanyId || agent.licensedCompany,
        )?.id,
        plan: normalizeAgentPlan(agent.plan),
        legalName: agent.legalName || agent.name,
        email: agent.email.toLowerCase(),
        licenseNumber: agent.licenseNumber,
        phone: agent.phone,
        practice: agent.practice,
        referredByAgentId: agent.referredByAgentId,
        teamId: agent.teamId,
        teamTermsConfigId: agent.teamTermsConfigId,
        teamTermsEffectiveFrom: agent.teamTermsEffectiveFrom,
        affiliationTermMonths: agent.affiliationTermMonths,
        liborMembershipStatus: agent.liborMembershipStatus,
      }),
    )
    .digest("hex");
}
export async function availableOnboardingPackage(agent: Agent) {
  const company = resolveLicensedCompany(
    agent.licensedCompanyId || agent.licensedCompany,
  );
  if (!company || (company.requiresLiborOneKey && !agent.liborMembershipStatus))
    throw new SigningBridgeError("COMPLETE_COMPANY_SELECTION", 409);
  const actor = await signingSystemActor(agent.id);
  const result = await signingBridgeJson(
    "/v1/packages",
    actor,
    z.object({ items: z.array(signingPackageSchema) }),
  );
  const expected = {
    plan: normalizeAgentPlan(agent.plan),
    liborMembershipStatus: agent.liborMembershipStatus || "",
  };
  const matches = result.items.filter(
    (p) =>
      p.scenario === "onboarding" &&
      p.company_key === company.id &&
      p.selectors.plan === expected.plan &&
      (!company.requiresLiborOneKey ||
        p.selectors.liborMembershipStatus === expected.liborMembershipStatus) &&
      Object.entries(p.selectors).every(
        ([key, value]) =>
          key in expected && expected[key as keyof typeof expected] === value,
      ),
  );
  const keys = new Set(matches.map((p) => p.package_key));
  if (keys.size !== 1)
    throw new SigningBridgeError(
      matches.length
        ? "AMBIGUOUS_ONBOARDING_PACKAGE"
        : "ONBOARDING_PACKAGE_NOT_PUBLISHED",
      409,
    );
  return matches.sort((a, b) => b.version - a.version)[0];
}
async function checkProfileAndTeam(
  agent: Agent,
  query: typeof db | DbTransaction = db,
) {
  if (agent.accountStatus !== "pending" || !agent.onboardingCompletedAt)
    throw new SigningBridgeError("COMPLETE_ONBOARDING_PROFILE", 409);
  if (normalizeAgentPlan(agent.plan) !== "team_member") return;
  if (!agent.teamId || !agent.teamTermsConfigId)
    throw new SigningBridgeError("TEAM_APPROVAL_REQUIRED", 409);
  const [accepted] = await query
    .select({ id: teamJoinRequests.id })
    .from(teamJoinRequests)
    .where(
      and(
        eq(teamJoinRequests.agentId, agent.id),
        eq(teamJoinRequests.teamId, agent.teamId),
        eq(teamJoinRequests.acceptedConfigId, agent.teamTermsConfigId),
        eq(teamJoinRequests.status, "accepted"),
      ),
    )
    .limit(1);
  const [invitation] = agent.onboardingInviteId
    ? await query
        .select()
        .from(onboardingInvitations)
        .where(eq(onboardingInvitations.id, agent.onboardingInviteId))
        .limit(1)
    : [];
  if (!accepted && !hasPreapprovedTeamRouting(invitation, agent.teamId))
    throw new SigningBridgeError("TEAM_APPROVAL_REQUIRED", 409);
}
async function buildPreparation(
  agent: Agent,
  published: SigningPackage,
): Promise<SigningPreparation> {
  const legalName = requireLegalName(agent);
  const actor = await signingSystemActor(agent.id),
    company = resolveLicensedCompany(
      agent.licensedCompanyId || agent.licensedCompany,
    )!;
  if (!actor.verifiedEmails.includes(agent.email.toLowerCase()))
    throw new SigningBridgeError("PRIMARY_SIGNING_EMAIL_NOT_VERIFIED", 409);
  const [team] = agent.teamId
    ? await db
        .select({ name: teams.name })
        .from(teams)
        .where(eq(teams.id, agent.teamId))
        .limit(1)
    : [];
  const [sponsor] = agent.referredByAgentId
    ? await db
        .select({ name: agents.legalName })
        .from(agents)
        .where(eq(agents.id, agent.referredByAgentId))
        .limit(1)
    : [];
  const [terms] = agent.teamTermsConfigId
    ? await db
        .select()
        .from(teamCompensationConfigs)
        .where(eq(teamCompensationConfigs.id, agent.teamTermsConfigId))
        .limit(1)
    : [];
  const effectivePlan = normalizeAgentPlan(agent.plan);
  if (
    effectivePlan === "team_member" &&
    (!terms || terms.teamId !== agent.teamId)
  )
    throw new SigningBridgeError("TEAM_TERMS_REQUIRED", 409);
  const values: Record<string, string> = {
    agent_id: String(agent.id),
    agent_name: legalName,
    agent_email: agent.email,
    agent_phone: agent.phone || "",
    license_number: agent.licenseNumber || "",
    licensed_company: company.legalName,
    practice: agent.practice || "",
    compensation_plan: PLAN_LABELS.en[effectivePlan],
    split_pct: `${PLAN_SPLIT_PCT[effectivePlan]}%`,
    team_name: team?.name || "",
    team_split_pct: terms ? `${terms.defaultTeamSplitPct}%` : "",
    team_sourced_split_pct: terms ? `${terms.teamLeadSplitPct}%` : "",
    team_cap_usd: terms
      ? terms.teamCapCents == null
        ? "No cap"
        : `$${(terms.teamCapCents / 100).toLocaleString("en-US")}`
      : "",
    team_terms_effective_from: terms ? agent.teamTermsEffectiveFrom || "" : "",
    sponsor_name: sponsor?.name || "",
    affiliation_term_months: String(agent.affiliationTermMonths || 12),
    libor_membership_status:
      agent.liborMembershipStatus === "existing_member"
        ? "Existing LIBOR member - new membership application not required"
        : "New LIBOR membership application required",
    libor_office_name: company.legalName,
    libor_office_address: "37-20 Prince St, STE 3H",
    libor_office_town: "Flushing",
    libor_office_state: "NY",
    libor_office_zip: "11354",
    libor_office_phone: "(929) 666-9886",
    libor_office_fax: "",
    libor_office_email: "sunnyz@homixny.com",
    libor_office_web: "www.homixny.com",
  };
  const roleMap = new Map(
    published.definition
      .flatMap((p) => p.roles)
      .map((role) => [role.key, role]),
  );
  const recipients = [...roleMap.values()].map((role) => {
    if (role.actor === "owner")
      return {
        key: role.key,
        name: legalName,
        email: agent.email.toLowerCase(),
      };
    if (
      role.actor !== "company" ||
      !published.company_signer_email ||
      !published.company_signer_name
    )
      throw new SigningBridgeError("COMPANY_SIGNER_NOT_CONFIGURED", 409);
    return {
      key: role.key,
      name: published.company_signer_name,
      email: published.company_signer_email,
    };
  });
  for (const field of published.definition.flatMap((p) => p.prefill))
    if (!(field.key in values))
      throw new SigningBridgeError("UNSUPPORTED_ONBOARDING_PREFILL", 409);
  const id = randomUUID();
  return {
    id,
    contextHash: onboardingSigningContextHash(agent),
    packageId: published.id,
    payload: {
      title: `${legalName} · ${company.legalName} onboarding`,
      idempotencyKey: `onboarding:${id}`,
      externalReference: `onboarding:${id}`,
      scenario: "onboarding",
      packageId: published.id,
      companyKey: company.id,
      ownerAgentId: agent.id,
      business: {
        customer: legalName,
        property: "",
        reference: `agent:${agent.id}`,
      },
      recipients,
      values,
    },
  };
}
export async function getOnboardingSigningRequest(
  agent: Agent,
  refresh = true,
) {
  if (!agent.signingRequestId || !agent.signingPreparation)
    throw new SigningBridgeError("AGREEMENT_NOT_STARTED", 409);
  const actor = await signingSystemActor(agent.id);
  const request = await signingBridgeJson(
    `/v1/requests/${agent.signingRequestId}${refresh ? "/refresh" : ""}`,
    actor,
    signingRequestSchema,
    refresh ? {} : undefined,
  );
  if (
    request.ownerAgentId !== agent.id ||
    request.id !== agent.signingRequestId ||
    request.scenario !== "onboarding"
  )
    throw new SigningBridgeError("AGREEMENT_OWNER_MISMATCH", 409);
  if (
    agent.accountStatus === "pending" &&
    agent.signingPreparation.contextHash !== onboardingSigningContextHash(agent)
  )
    throw new SigningBridgeError("ONBOARDING_FACTS_CHANGED", 409);
  return request;
}
export async function syncDocumensoOnboarding(agent: Agent) {
  if (!agent.signingRequestId) return agent;
  const request = await getOnboardingSigningRequest(agent);
  const progress = hrSigningProgress(request),
    product = onboardingPaymentProduct(agent.plan, agent.affiliationTermMonths);
  const eligibleSignature =
    Boolean(verifiedManualContract(agent)) ||
    (progress.agentSignedAt &&
      !["declined", "voided", "expired", "failed"].includes(progress.status));
  const stage =
    agent.accountStatus === "active"
      ? "complete"
      : eligibleSignature
        ? product && agent.paymentStatus !== "paid"
          ? "payment"
          : "review"
        : "agreement";
  const teamTermsAcceptedAt =
    progress.agentSignedAt && agent.teamTermsConfigId
      ? progress.agentSignedAt
      : agent.teamTermsAcceptedAt;
  if (
    agent.agreementStatus === progress.status &&
    agent.agreementAgentSignedAt === progress.agentSignedAt &&
    agent.agreementCountersignedAt === progress.companySignedAt &&
    agent.agreementCompletedAt === progress.completedAt &&
    agent.onboardingStage === stage &&
    agent.teamTermsAcceptedAt === teamTermsAcceptedAt
  )
    return agent;
  return db.transaction(async (tx) => {
    await lockOnboardingAgent(tx, agent.id);
    const [fresh] = await tx
      .select()
      .from(agents)
      .where(eq(agents.id, agent.id))
      .limit(1);
    if (
      !fresh ||
      fresh.signingRequestId !== request.id ||
      fresh.signingPreparation?.id !== agent.signingPreparation?.id ||
      (fresh.accountStatus === "pending" &&
        fresh.signingPreparation?.contextHash !==
          onboardingSigningContextHash(fresh))
    )
      throw new SigningBridgeError("ONBOARDING_FACTS_CHANGED", 409);
    const [updated] = await tx
      .update(agents)
      .set({
        agreementStatus: progress.status,
        agreementAgentSignedAt: progress.agentSignedAt,
        agreementCountersignedAt: progress.companySignedAt,
        agreementCompletedAt: progress.completedAt,
        onboardingStage: fresh.accountStatus === "active" ? "complete" : stage,
        teamTermsAcceptedAt,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(agents.id, fresh.id),
          eq(agents.signingRequestId, request.id),
          sql`${agents.updatedAt} IS NOT DISTINCT FROM ${agent.updatedAt}::timestamptz`,
        ),
      )
      .returning();
    if (!updated) return fresh;
    await tx
      .insert(onboardingEvents)
      .values(
        onboardingEventValues({
          agentId: agent.id,
          eventType: "documenso_agreement_refreshed",
          detail: {
            requestId: request.id,
            status: progress.status,
            agentSignedAt: progress.agentSignedAt,
            companySignedAt: progress.companySignedAt,
            companyExpired: progress.companyExpired,
          },
        }),
      );
    return updated;
  });
}
export async function prepareOnboardingSigning(agent: Agent) {
  if (verifiedManualContract(agent)) return agent;
  await checkProfileAndTeam(agent);
  const actor = await signingSystemActor(agent.id);
  let preparation = agent.signingPreparation;
  if (!preparation)
    preparation = await buildPreparation(
      agent,
      await availableOnboardingPackage(agent),
    );
  const current = await db.transaction(async (tx) => {
    await lockOnboardingAgent(tx, agent.id);
    const [fresh] = await tx
      .select()
      .from(agents)
      .where(eq(agents.id, agent.id))
      .limit(1);
    if (
      !fresh ||
      fresh.accountStatus !== "pending" ||
      !fresh.onboardingCompletedAt ||
      onboardingSigningContextHash(fresh) !== preparation!.contextHash
    )
      throw new SigningBridgeError("ONBOARDING_FACTS_CHANGED", 409);
    await checkProfileAndTeam(fresh, tx);
    if (verifiedManualContract(fresh)) return fresh;
    if (fresh.signingPreparation) {
      if (fresh.signingPreparation.contextHash !== preparation!.contextHash)
        throw new SigningBridgeError("ONBOARDING_FACTS_CHANGED", 409);
      return fresh;
    }
    const [saved] = await tx
      .update(agents)
      .set({
        signingPreparation: preparation,
        onboardingSigningClosure: null,
        agreementStatus: "preparing",
        onboardingStage: "agreement",
        agreementAgentSignedAt: null,
        agreementCountersignedAt: null,
        agreementCompletedAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agents.id, agent.id))
      .returning();
    await tx
      .insert(onboardingEvents)
      .values(
        onboardingEventValues({
          agentId: agent.id,
          actorAgentId: agent.id,
          eventType: "documenso_agreement_prepared",
          detail: {
            preparationId: preparation!.id,
            packageId: preparation!.packageId,
          },
        }),
      );
    return saved;
  });
  if (verifiedManualContract(current)) return current;
  let request = current.signingRequestId
    ? await getOnboardingSigningRequest(current)
    : await signingBridgeJson(
        "/v1/requests",
        actor,
        signingRequestSchema,
        current.signingPreparation!.payload,
      );
  if (!current.signingRequestId)
    await db.transaction(async (tx) => {
      await lockOnboardingAgent(tx, agent.id);
      const [fresh] = await tx
        .select()
        .from(agents)
        .where(eq(agents.id, agent.id))
        .limit(1);
      if (
        !fresh ||
        fresh.signingPreparation?.id !== current.signingPreparation!.id ||
        (fresh.signingRequestId && fresh.signingRequestId !== request.id)
      )
        throw new SigningBridgeError("ONBOARDING_FACTS_CHANGED", 409);
      await tx
        .update(agents)
        .set({
          signingRequestId: request.id,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(agents.id, agent.id));
    });
  if (
    request.parts.every((part) => part.operationState === "linked") &&
    request.parts.some((part) => part.document?.status === "DRAFT")
  )
    request = await signingBridgeJson(
      `/v1/requests/${request.id}/commands`,
      actor,
      signingRequestSchema,
      { action: "send" },
    );
  const [fresh] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agent.id))
    .limit(1);
  return syncDocumensoOnboarding(fresh);
}

export async function recoverOnboardingSigning(agent: Agent) {
  if (verifiedManualContract(agent)) return agent;
  await checkProfileAndTeam(agent);
  if (!agent.signingRequestId) return prepareOnboardingSigning(agent);
  const request = await getOnboardingSigningRequest(agent),
    progress = hrSigningProgress(request);
  const actor = await signingSystemActor(agent.id);
  if (progress.status === "expired") {
    // Native redistribution renews only unsigned links; it keeps the original
    // document and signatures already collected from other recipients.
    await signingBridgeJson(
      `/v1/requests/${request.id}/commands`,
      actor,
      signingRequestSchema,
      { action: "remind", recipientActor: "owner" },
    );
    return syncDocumensoOnboarding(agent);
  }
  if (!["declined", "voided"].includes(progress.status))
    return prepareOnboardingSigning(agent);
  if (
    request.parts.some(
      (part) =>
        part.error ||
        (part.operationState !== "discarded" &&
          !["CANCELLED", "REJECTED", "COMPLETED"].includes(
            part.document?.status || "",
          )),
    )
  )
    throw new SigningBridgeError("CANCEL_REMAINING_INVITATIONS_FIRST", 409);
  const fresh = await db.transaction(async (tx) => {
    await lockOnboardingAgent(tx, agent.id);
    const [current] = await tx
      .select()
      .from(agents)
      .where(eq(agents.id, agent.id))
      .limit(1);
    if (
      !current ||
      current.signingRequestId !== request.id ||
      current.signingPreparation?.id !== agent.signingPreparation?.id ||
      current.accountStatus !== "pending"
    )
      throw new SigningBridgeError("ONBOARDING_FACTS_CHANGED", 409);
    if (verifiedManualContract(current)) return current;
    await tx
      .insert(onboardingEvents)
      .values(
        onboardingEventValues({
          agentId: current.id,
          actorAgentId: current.id,
          eventType: "documenso_agreement_superseded",
          detail: {
            requestId: request.id,
            packageId: current.signingPreparation!.packageId,
            preparationId: current.signingPreparation!.id,
            status: progress.status,
          },
        }),
      );
    const [updated] = await tx
      .update(agents)
      .set({
        signingRequestId: null,
        signingPreparation: null,
        agreementStatus: "not_started",
        agreementAgentSignedAt: null,
        agreementCountersignedAt: null,
        agreementCompletedAt: null,
        teamTermsAcceptedAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agents.id, current.id))
      .returning();
    return updated;
  });
  return prepareOnboardingSigning(fresh);
}
