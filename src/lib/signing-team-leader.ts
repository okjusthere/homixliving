import "server-only";
import { affiliationContractComplete } from "@/lib/onboarding-requirements";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  onboardingEvents,
  teamCompensationConfigs,
  teamLeaderApplications,
  teams,
  type SigningPreparation,
} from "@/db/schema";
import { lockOnboardingAgent, type DbTransaction } from "@/lib/advisory-locks";
import { resolveLicensedCompany } from "@/lib/licensed-companies";
import {
  signingBridgeJson,
  signingSystemActor,
  SigningBridgeError,
} from "@/lib/signing-bridge";
import {
  signingPackageSchema,
  signingRequestSchema,
} from "@/lib/signing-contract";
import { hrSigningProgress } from "@/lib/signing-hr-projection";
import { onboardingEventValues } from "@/lib/onboarding-events";

type Application = typeof teamLeaderApplications.$inferSelect;
function contextHash(application: Application) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        applicantAgentId: application.applicantAgentId,
        companyId: application.companyId,
        teamId: application.teamId,
        configId: application.teamCompensationConfigId,
        expectedMemberCount: application.expectedMemberCount,
        positioning: application.positioning,
      }),
    )
    .digest("hex");
}
export async function availableTeamLeaderPackage(application: Application) {
  const company = resolveLicensedCompany(
    application.companyId || application.licensedCompany,
  );
  if (!company) throw new SigningBridgeError("COMPLETE_COMPANY_SELECTION", 409);
  const result = await signingBridgeJson(
    "/v1/packages",
    await signingSystemActor(application.applicantAgentId),
    z.object({ items: z.array(signingPackageSchema) }),
  );
  const matches = result.items.filter(
    (p) =>
      p.scenario === "team_leader" &&
      p.company_key === company.id &&
      Object.entries(p.selectors).every(
        ([key, value]) => key === "plan" && value === "solo_pro",
      ),
  );
  if (new Set(matches.map((p) => p.package_key)).size !== 1)
    throw new SigningBridgeError(
      matches.length
        ? "AMBIGUOUS_ONBOARDING_PACKAGE"
        : "ONBOARDING_PACKAGE_NOT_PUBLISHED",
      409,
    );
  return matches.sort((a, b) => b.version - a.version)[0];
}
async function eligible(
  application: Application,
  query: typeof db | DbTransaction = db,
) {
  const [agent] = await query
    .select()
    .from(agents)
    .where(eq(agents.id, application.applicantAgentId))
    .limit(1);
  if (
    !agent ||
    agent.accountStatus !== "active" ||
    !affiliationContractComplete(agent) ||
    agent.plan !== "solo_pro" ||
    !application.companyId ||
    agent.licensedCompanyId !== application.companyId
  )
    throw new SigningBridgeError("TEAM_LEADER_ELIGIBILITY_CHANGED", 409);
  if (
    application.status !== "approved" ||
    !application.teamId ||
    !application.teamCompensationConfigId
  )
    throw new SigningBridgeError("TEAM_LEADER_APPLICATION_NOT_READY", 409);
  const [team] = await query
    .select()
    .from(teams)
    .where(eq(teams.id, application.teamId))
    .limit(1);
  const [terms] = await query
    .select()
    .from(teamCompensationConfigs)
    .where(eq(teamCompensationConfigs.id, application.teamCompensationConfigId))
    .limit(1);
  if (
    !team ||
    team.status !== "forming" ||
    team.companyId !== application.companyId ||
    !terms ||
    terms.teamId !== team.id
  )
    throw new SigningBridgeError("TEAM_TERMS_REQUIRED", 409);
  return { agent, team, terms };
}
async function preparation(
  application: Application,
): Promise<SigningPreparation> {
  const { agent, team, terms } = await eligible(application),
    published = await availableTeamLeaderPackage(application);
  const actor = await signingSystemActor(agent.id),
    company = resolveLicensedCompany(application.companyId)!;
  if (!actor.verifiedEmails.includes(agent.email.toLowerCase()))
    throw new SigningBridgeError("PRIMARY_SIGNING_EMAIL_NOT_VERIFIED", 409);
  const values: Record<string, string> = {
    agent_id: String(agent.id),
    agent_name: agent.legalName || agent.name,
    agent_email: agent.email,
    agent_phone: agent.phone || "",
    license_number: agent.licenseNumber || "",
    licensed_company: company.legalName,
    compensation_plan: "solo_pro",
    team_name: team.name,
    expected_member_count: String(application.expectedMemberCount),
    team_positioning: application.positioning,
    team_split_pct: String(terms.defaultTeamSplitPct),
    team_sourced_split_pct: String(terms.teamLeadSplitPct),
    team_cap_usd:
      terms.teamCapCents == null ? "No cap" : String(terms.teamCapCents / 100),
    team_terms_effective_from: terms.effectiveFrom,
    team_config_version: String(terms.version),
  };
  const roles = new Map(
    published.definition
      .flatMap((p) => p.roles)
      .map((role) => [role.key, role]),
  );
  const recipients = [...roles.values()].map((role) => {
    if (role.actor === "owner")
      return {
        key: role.key,
        name: agent.legalName || agent.name,
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
    contextHash: contextHash(application),
    packageId: published.id,
    payload: {
      title: `${agent.legalName || agent.name} · ${team.name} Team Leader agreement`,
      idempotencyKey: `team-leader:${id}`,
      externalReference: `team-leader:${id}`,
      scenario: "team_leader",
      packageId: published.id,
      companyKey: company.id,
      ownerAgentId: agent.id,
      business: {
        customer: agent.legalName || agent.name,
        property: "",
        reference: `team-leader:${application.id}`,
      },
      recipients,
      values,
    },
  };
}
export async function getTeamLeaderSigningRequest(application: Application) {
  if (!application.signingRequestId || !application.signingPreparation)
    throw new SigningBridgeError("AGREEMENT_NOT_STARTED", 409);
  if (application.signingPreparation.contextHash !== contextHash(application))
    throw new SigningBridgeError("ONBOARDING_FACTS_CHANGED", 409);
  const request = await signingBridgeJson(
    `/v1/requests/${application.signingRequestId}/refresh`,
    await signingSystemActor(application.applicantAgentId),
    signingRequestSchema,
    {},
  );
  if (
    request.id !== application.signingRequestId ||
    request.ownerAgentId !== application.applicantAgentId ||
    request.scenario !== "team_leader"
  )
    throw new SigningBridgeError("AGREEMENT_OWNER_MISMATCH", 409);
  return request;
}
export async function syncDocumensoTeamLeader(application: Application) {
  if (!application.signingRequestId) return application;
  const request = await getTeamLeaderSigningRequest(application),
    progress = hrSigningProgress(request);
  if (
    progress.status === application.agreementStatus &&
    progress.completedAt === application.agreementCompletedAt
  )
    return application;
  return db.transaction(async (tx) => {
    await lockOnboardingAgent(tx, application.applicantAgentId);
    const [updated] = await tx
      .update(teamLeaderApplications)
      .set({
        agreementStatus: progress.status,
        agreementCompletedAt: progress.completedAt,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(teamLeaderApplications.id, application.id),
          eq(teamLeaderApplications.signingRequestId, request.id),
          sql`${teamLeaderApplications.updatedAt} IS NOT DISTINCT FROM ${application.updatedAt}::timestamptz`,
        ),
      )
      .returning();
    if (!updated)
      return (
        (
          await tx
            .select()
            .from(teamLeaderApplications)
            .where(eq(teamLeaderApplications.id, application.id))
            .limit(1)
        )[0] || application
      );
    await tx.insert(onboardingEvents).values(
      onboardingEventValues({
        agentId: application.applicantAgentId,
        teamId: application.teamId,
        eventType: "team_leader_agreement_status_changed",
        detail: {
          applicationId: application.id,
          requestId: request.id,
          from: application.agreementStatus,
          to: progress.status,
          agentSignedAt: progress.agentSignedAt,
          companySignedAt: progress.companySignedAt,
        },
      }),
    );
    return updated;
  });
}
export async function prepareTeamLeaderSigning(application: Application) {
  const proposed =
    application.signingPreparation || (await preparation(application));
  const current = await db.transaction(async (tx) => {
    await lockOnboardingAgent(tx, application.applicantAgentId);
    const [fresh] = await tx
      .select()
      .from(teamLeaderApplications)
      .where(eq(teamLeaderApplications.id, application.id))
      .limit(1);
    if (
      !fresh ||
      fresh.applicantAgentId !== application.applicantAgentId ||
      contextHash(fresh) !== proposed.contextHash
    )
      throw new SigningBridgeError("ONBOARDING_FACTS_CHANGED", 409);
    await eligible(fresh, tx);
    if (fresh.signingPreparation) return fresh;
    const [saved] = await tx
      .update(teamLeaderApplications)
      .set({
        signingPreparation: proposed,
        agreementStatus: "preparing",
        agreementCompletedAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(teamLeaderApplications.id, fresh.id))
      .returning();
    await tx.insert(onboardingEvents).values(
      onboardingEventValues({
        agentId: fresh.applicantAgentId,
        actorAgentId: fresh.applicantAgentId,
        teamId: fresh.teamId,
        eventType: "team_leader_agreement_prepared",
        detail: {
          applicationId: fresh.id,
          preparationId: proposed.id,
          packageId: proposed.packageId,
        },
      }),
    );
    return saved;
  });
  const actor = await signingSystemActor(current.applicantAgentId);
  const request = current.signingRequestId
    ? await getTeamLeaderSigningRequest(current)
    : await signingBridgeJson(
        "/v1/requests",
        actor,
        signingRequestSchema,
        current.signingPreparation!.payload,
      );
  await db.transaction(async (tx) => {
    await lockOnboardingAgent(tx, current.applicantAgentId);
    const [fresh] = await tx
      .select()
      .from(teamLeaderApplications)
      .where(eq(teamLeaderApplications.id, current.id))
      .limit(1);
    if (
      !fresh ||
      fresh.signingPreparation?.id !== current.signingPreparation!.id ||
      (fresh.signingRequestId && fresh.signingRequestId !== request.id)
    )
      throw new SigningBridgeError("ONBOARDING_FACTS_CHANGED", 409);
    if (!fresh.signingRequestId)
      await tx
        .update(teamLeaderApplications)
        .set({
          signingRequestId: request.id,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(teamLeaderApplications.id, fresh.id));
  });
  if (
    request.parts.every((p) => p.operationState === "linked") &&
    request.parts.some((p) => p.document?.status === "DRAFT")
  )
    await signingBridgeJson(
      `/v1/requests/${request.id}/commands`,
      actor,
      signingRequestSchema,
      { action: "send" },
    );
  const [fresh] = await db
    .select()
    .from(teamLeaderApplications)
    .where(eq(teamLeaderApplications.id, current.id))
    .limit(1);
  return syncDocumensoTeamLeader(fresh);
}
export async function recoverTeamLeaderSigning(application: Application) {
  if (!application.signingRequestId)
    return prepareTeamLeaderSigning(application);
  const request = await getTeamLeaderSigningRequest(application),
    progress = hrSigningProgress(request),
    actor = await signingSystemActor(application.applicantAgentId);
  if (progress.status === "expired") {
    await signingBridgeJson(
      `/v1/requests/${request.id}/commands`,
      actor,
      signingRequestSchema,
      { action: "remind", recipientActor: "owner" },
    );
    return syncDocumensoTeamLeader(application);
  }
  if (!["voided", "declined"].includes(progress.status))
    return prepareTeamLeaderSigning(application);
  if (
    request.parts.some(
      (p) =>
        p.error ||
        (p.operationState !== "discarded" &&
          !["CANCELLED", "REJECTED", "COMPLETED"].includes(
            p.document?.status || "",
          )),
    )
  )
    throw new SigningBridgeError("CANCEL_REMAINING_INVITATIONS_FIRST", 409);
  const updated = await db.transaction(async (tx) => {
    await lockOnboardingAgent(tx, application.applicantAgentId);
    const [fresh] = await tx
      .select()
      .from(teamLeaderApplications)
      .where(eq(teamLeaderApplications.id, application.id))
      .limit(1);
    if (!fresh || fresh.signingRequestId !== request.id)
      throw new SigningBridgeError("ONBOARDING_FACTS_CHANGED", 409);
    await eligible(fresh, tx);
    await tx.insert(onboardingEvents).values(
      onboardingEventValues({
        agentId: fresh.applicantAgentId,
        actorAgentId: fresh.applicantAgentId,
        teamId: fresh.teamId,
        eventType: "team_leader_agreement_superseded",
        detail: {
          applicationId: fresh.id,
          requestId: request.id,
          preparationId: fresh.signingPreparation?.id,
          status: progress.status,
        },
      }),
    );
    const [saved] = await tx
      .update(teamLeaderApplications)
      .set({
        signingRequestId: null,
        signingPreparation: null,
        agreementStatus: "not_started",
        agreementCompletedAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(teamLeaderApplications.id, fresh.id))
      .returning();
    return saved;
  });
  return prepareTeamLeaderSigning(updated);
}
