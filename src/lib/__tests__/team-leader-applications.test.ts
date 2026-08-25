import assert from "node:assert/strict";
import {
  canCreateTeamRecruitingInvitation,
  shouldActivateFormingTeam,
  teamLeaderApplicationEligibility,
  validateTeamLeaderApplicationInput,
} from "../team-leader-applications";

assert.equal(teamLeaderApplicationEligibility({
  accountStatus: "active",
  plan: "solo_pro",
  licensedCompanySupported: true,
  alreadyLeadsTeam: false,
}), null);
assert.equal(teamLeaderApplicationEligibility({
  accountStatus: "active",
  plan: "solo",
  licensedCompanySupported: true,
  alreadyLeadsTeam: false,
}), "solo_pro_required");
assert.equal(teamLeaderApplicationEligibility({
  accountStatus: "active",
  plan: "solo_pro",
  licensedCompanySupported: true,
  alreadyLeadsTeam: false,
  openApplicationStatus: "submitted",
}), "application_already_open");
assert.equal(teamLeaderApplicationEligibility({
  accountStatus: "active",
  plan: "solo_pro",
  licensedCompanySupported: false,
  alreadyLeadsTeam: false,
}), "licensed_company_required");

assert.deepEqual(validateTeamLeaderApplicationInput({
  proposedTeamName: "  Queens Growth Team ",
  expectedMemberCount: "8",
  positioning: "Bilingual first-time buyer and rental specialists.",
  proposedTeamSplitPct: "10",
}), {
  proposedTeamName: "Queens Growth Team",
  expectedMemberCount: 8,
  positioning: "Bilingual first-time buyer and rental specialists.",
  proposedTeamSplitPct: 10,
});
assert.throws(() => validateTeamLeaderApplicationInput({
  proposedTeamName: "A",
  expectedMemberCount: 0,
  positioning: "short",
  proposedTeamSplitPct: 12,
}));

assert.equal(canCreateTeamRecruitingInvitation({
  teamStatus: "forming",
  leaderAgreementStatus: "sent",
}), false);
assert.equal(canCreateTeamRecruitingInvitation({
  teamStatus: "forming",
  leaderAgreementStatus: "completed",
}), true);
assert.equal(canCreateTeamRecruitingInvitation({ teamStatus: "active" }), true);
assert.equal(canCreateTeamRecruitingInvitation({ teamStatus: "inactive" }), false);

assert.equal(shouldActivateFormingTeam({
  teamStatus: "forming",
  leaderAgreementStatus: "completed",
  memberAgreementStatus: "completed",
}), true);
assert.equal(shouldActivateFormingTeam({
  teamStatus: "forming",
  leaderAgreementStatus: "sent",
  memberAgreementStatus: "completed",
}), false);

console.log("team leader application tests passed");
