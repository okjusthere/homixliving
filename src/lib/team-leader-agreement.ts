import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, onboardingEvents, teamLeaderApplications, teams } from "@/db/schema";
import { lockTeamConfiguration } from "@/lib/advisory-locks";
import {
  getESignEnvelope,
  getESignEvidence,
  isTeamLeaderESignConfigured,
  teamLeaderESignTemplateConfiguration,
  type ESignEnvelope,
} from "@/lib/esign";
import { notify } from "@/lib/notify";
import { onboardingEventValues } from "@/lib/onboarding-events";
import { shouldActivateFormingTeam } from "@/lib/team-leader-applications";

function teamLeaderAgreementState(status: ESignEnvelope["status"]) {
  if (status === "DRAFT" || status === "PREPARED" || status === "READY_TO_SEND") return "preparing" as const;
  if (status === "COMPLETED") return "completed" as const;
  if (status === "DECLINED") return "declined" as const;
  if (status === "VOIDED") return "voided" as const;
  if (status === "EXPIRED") return "expired" as const;
  if (status === "FAILED_FINALIZATION") return "failed" as const;
  return "sent" as const;
}

export async function syncTeamLeaderAgreement(
  application: typeof teamLeaderApplications.$inferSelect,
  licensedCompany: string | null,
) {
  if (!application.esignEnvelopeId) return application;
  if (!isTeamLeaderESignConfigured(licensedCompany)) {
    throw new Error("The licensed company does not have a configured Team Leader agreement.");
  }
  const configuration = teamLeaderESignTemplateConfiguration(licensedCompany);
  if (!configuration) throw new Error("The Team Leader agreement is not configured.");
  const envelope = await getESignEnvelope(application.esignEnvelopeId);
  if (envelope.templateVersionId !== configuration.templateVersionId) {
    throw new Error("The Team Leader envelope uses an unapproved template version.");
  }
  const agreementStatus = teamLeaderAgreementState(envelope.status);
  let evidencePackageId = application.esignEvidencePackageId;
  let agreementCompletedAt = application.agreementCompletedAt;
  if (agreementStatus === "completed") {
    const evidence = await getESignEvidence(envelope.id);
    if (evidence.verificationStatus !== "VERIFIED") {
      throw new Error("The Team Leader evidence package could not be verified.");
    }
    if (envelope.evidencePackageId && envelope.evidencePackageId !== evidence.id) {
      throw new Error("The Team Leader evidence package does not match the envelope.");
    }
    evidencePackageId = evidence.id;
    agreementCompletedAt = envelope.completedAt || agreementCompletedAt || new Date().toISOString();
  }
  if (
    agreementStatus === application.agreementStatus &&
    envelope.templateVersionId === application.esignTemplateVersionId &&
    evidencePackageId === application.esignEvidencePackageId &&
    agreementCompletedAt === application.agreementCompletedAt
  ) return application;
  return db.transaction(async (tx) => {
    const [updated] = await tx.update(teamLeaderApplications).set({
      agreementStatus,
      esignTemplateVersionId: envelope.templateVersionId,
      esignEvidencePackageId: evidencePackageId || null,
      agreementCompletedAt: agreementCompletedAt || null,
      updatedAt: new Date().toISOString(),
    }).where(and(
      eq(teamLeaderApplications.id, application.id),
      eq(teamLeaderApplications.agreementStatus, application.agreementStatus),
    )).returning();
    if (!updated) {
      const [fresh] = await tx
        .select()
        .from(teamLeaderApplications)
        .where(eq(teamLeaderApplications.id, application.id))
        .limit(1);
      return fresh || application;
    }
    if (agreementStatus !== application.agreementStatus) {
      await tx.insert(onboardingEvents).values(onboardingEventValues({
        eventType: "team_leader_agreement_status_changed",
        agentId: updated.applicantAgentId,
        teamId: updated.teamId,
        detail: {
          applicationId: updated.id,
          from: application.agreementStatus,
          to: agreementStatus,
          envelopeId: updated.esignEnvelopeId,
          templateVersionId: updated.esignTemplateVersionId,
          evidencePackageId: updated.esignEvidencePackageId,
        },
      }));
    }
    return updated;
  });
}

export async function markTeamLeaderAgreementSent(applicationId: number) {
  return db.transaction(async (tx) => {
    const [sent] = await tx.update(teamLeaderApplications).set({
      agreementStatus: "sent",
      updatedAt: new Date().toISOString(),
    }).where(and(
      eq(teamLeaderApplications.id, applicationId),
      eq(teamLeaderApplications.agreementStatus, "preparing"),
    )).returning();
    if (!sent) {
      const [current] = await tx
        .select()
        .from(teamLeaderApplications)
        .where(eq(teamLeaderApplications.id, applicationId))
        .limit(1);
      return current || null;
    }
    await tx.insert(onboardingEvents).values(onboardingEventValues({
      eventType: "team_leader_agreement_sent",
      agentId: sent.applicantAgentId,
      teamId: sent.teamId,
      detail: {
        applicationId: sent.id,
        envelopeId: sent.esignEnvelopeId,
        templateVersionId: sent.esignTemplateVersionId,
      },
    }));
    return sent;
  });
}

export async function activateFormingTeamAfterMemberAgreement(input: {
  teamId: number | null;
  memberAgentId: number;
  memberAgreementStatus: typeof agents.$inferSelect["agreementStatus"];
}) {
  if (!input.teamId || input.memberAgreementStatus !== "completed") return false;
  const result = await db.transaction(async (tx) => {
    await lockTeamConfiguration(tx, input.teamId!);
    const [team] = await tx.select().from(teams).where(eq(teams.id, input.teamId!)).limit(1);
    if (!team || team.status !== "forming" || !team.leaderAgentId) return null;
    const [application] = await tx
      .select()
      .from(teamLeaderApplications)
      .where(and(
        eq(teamLeaderApplications.teamId, team.id),
        eq(teamLeaderApplications.status, "approved"),
      ))
      .limit(1);
    const [leader] = await tx
      .select({
        accountStatus: agents.accountStatus,
        agreementStatus: agents.agreementStatus,
        licensedCompanyId: agents.licensedCompanyId,
        plan: agents.plan,
      })
      .from(agents)
      .where(eq(agents.id, team.leaderAgentId))
      .limit(1);
    const [member] = await tx
      .select({
        agreementStatus: agents.agreementStatus,
        licensedCompanyId: agents.licensedCompanyId,
        plan: agents.plan,
        teamId: agents.teamId,
      })
      .from(agents)
      .where(eq(agents.id, input.memberAgentId))
      .limit(1);
    if (
      !application ||
      !team.companyId ||
      application.applicantAgentId !== team.leaderAgentId ||
      application.companyId !== team.companyId ||
      !leader ||
      leader.accountStatus !== "active" ||
      leader.agreementStatus !== "completed" ||
      leader.plan !== "solo_pro" ||
      leader.licensedCompanyId !== team.companyId ||
      !member ||
      member.agreementStatus !== "completed" ||
      member.plan !== "team_member" ||
      member.teamId !== team.id ||
      member.licensedCompanyId !== team.companyId ||
      !shouldActivateFormingTeam({
      teamStatus: team.status,
      leaderAgreementStatus: application.agreementStatus,
      memberAgreementStatus: member.agreementStatus,
    })
    ) return null;
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const [activatedTeam] = await tx.update(teams).set({ status: "active" }).where(and(
      eq(teams.id, team.id),
      eq(teams.status, "forming"),
    )).returning({ id: teams.id });
    if (!activatedTeam) return null;
    await tx.update(teamLeaderApplications).set({
      status: "active",
      activatedAt: now,
      updatedAt: now,
    }).where(eq(teamLeaderApplications.id, application.id));
    await tx.update(agents).set({
      plan: "solo_pro",
      splitPct: 100,
      planEffectiveFrom: today,
      updatedAt: now,
    }).where(eq(agents.id, team.leaderAgentId));
    await tx.insert(onboardingEvents).values(onboardingEventValues({
      eventType: "team_activated_after_first_member_agreement",
      agentId: input.memberAgentId,
      teamId: team.id,
      detail: {
        applicationId: application.id,
        leaderAgentId: team.leaderAgentId,
        firstMemberAgentId: input.memberAgentId,
      },
    }));
    return { teamId: team.id, leaderAgentId: team.leaderAgentId };
  });
  if (!result) return false;
  await notify({
    recipientAgentIds: [result.leaderAgentId],
    type: "team_activated",
    title: "Your Homix team is active",
    body: "The first Team Member agreement is complete. Your Solo Pro plan and team are now active.",
    href: `/team-workspace?team=${result.teamId}`,
    dedupeKey: `team-activated:${result.teamId}`,
    email: true,
  }).catch((error) => console.error("Unable to notify activated Team Leader", error));
  return true;
}
