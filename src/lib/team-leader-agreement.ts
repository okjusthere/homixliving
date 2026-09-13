import { affiliationContractComplete } from "@/lib/onboarding-requirements";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  onboardingEvents,
  teamLeaderApplications,
  teams,
} from "@/db/schema";
import { lockTeamConfiguration } from "@/lib/advisory-locks";
import { syncDocumensoTeamLeader } from "@/lib/signing-team-leader";
import { notify } from "@/lib/notify";
import { onboardingEventValues } from "@/lib/onboarding-events";
import { shouldActivateFormingTeam } from "@/lib/team-leader-applications";

export async function syncTeamLeaderAgreement(
  application: typeof teamLeaderApplications.$inferSelect,
) {
  const updated = await syncDocumensoTeamLeader(application);
  if (updated.agreementStatus === "completed" && updated.teamId) {
    const members = await db
      .select()
      .from(agents)
      .where(
        and(eq(agents.teamId, updated.teamId), eq(agents.plan, "team_member")),
      );
    const member = members.find(affiliationContractComplete);
    if (member)
      await activateFormingTeamAfterMemberAgreement({
        teamId: updated.teamId,
        memberAgentId: member.id,
      });
  }
  return updated;
}

export async function activateFormingTeamAfterMemberAgreement(input: {
  teamId: number | null;
  memberAgentId: number;
}) {
  if (!input.teamId) return false;
  const result = await db.transaction(async (tx) => {
    await lockTeamConfiguration(tx, input.teamId!);
    const [team] = await tx
      .select()
      .from(teams)
      .where(eq(teams.id, input.teamId!))
      .limit(1);
    if (!team || team.status !== "forming" || !team.leaderAgentId) return null;
    const [application] = await tx
      .select()
      .from(teamLeaderApplications)
      .where(
        and(
          eq(teamLeaderApplications.teamId, team.id),
          eq(teamLeaderApplications.status, "approved"),
        ),
      )
      .limit(1);
    const [leader] = await tx
      .select()
      .from(agents)
      .where(eq(agents.id, team.leaderAgentId))
      .limit(1);
    const [member] = await tx
      .select()
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
      !affiliationContractComplete(leader) ||
      leader.plan !== "solo_pro" ||
      leader.licensedCompanyId !== team.companyId ||
      !member ||
      !affiliationContractComplete(member) ||
      member.plan !== "team_member" ||
      member.teamId !== team.id ||
      member.licensedCompanyId !== team.companyId ||
      !shouldActivateFormingTeam({
        teamStatus: team.status,
        leaderAgreementStatus: application.agreementStatus,
        memberAgreementStatus: member.agreementStatus,
        memberContractComplete: affiliationContractComplete(member),
      })
    )
      return null;
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const [activatedTeam] = await tx
      .update(teams)
      .set({ status: "active" })
      .where(and(eq(teams.id, team.id), eq(teams.status, "forming")))
      .returning({ id: teams.id });
    if (!activatedTeam) return null;
    await tx
      .update(teamLeaderApplications)
      .set({
        status: "active",
        activatedAt: now,
        updatedAt: now,
      })
      .where(eq(teamLeaderApplications.id, application.id));
    await tx
      .update(agents)
      .set({
        plan: "solo_pro",
        splitPct: 100,
        planEffectiveFrom: today,
        updatedAt: now,
      })
      .where(eq(agents.id, team.leaderAgentId));
    await tx.insert(onboardingEvents).values(
      onboardingEventValues({
        eventType: "team_activated_after_first_member_agreement",
        agentId: input.memberAgentId,
        teamId: team.id,
        detail: {
          applicationId: application.id,
          leaderAgentId: team.leaderAgentId,
          firstMemberAgentId: input.memberAgentId,
        },
      }),
    );
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
  }).catch((error) =>
    console.error("Unable to notify activated Team Leader", error),
  );
  return true;
}
