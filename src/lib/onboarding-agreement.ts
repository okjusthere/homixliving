import { affiliationContractComplete } from "@/lib/onboarding-requirements";
import { agents } from "@/db/schema";
import { syncDocumensoOnboarding } from "@/lib/signing-onboarding";
import { activateFormingTeamAfterMemberAgreement } from "@/lib/team-leader-agreement";

export async function syncOnboardingAgreement(
  agent: typeof agents.$inferSelect,
) {
  const updated = await syncDocumensoOnboarding(agent);
  if (updated.plan === "team_member" && affiliationContractComplete(updated)) {
    await activateFormingTeamAfterMemberAgreement({
      teamId: updated.teamId,
      memberAgentId: updated.id,
    });
  }
  return updated;
}
