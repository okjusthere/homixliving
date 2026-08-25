import assert from "node:assert/strict";
import {
  canDecideTeamJoinRequest,
  canReuseAcceptedTeamRouting,
  hasPreapprovedTeamRouting,
  requiresTeamJoinApproval,
  teamDeletionBlocker,
} from "../team-join-requests";

const personalReferral = {
  kind: "personal_referral",
  plan: "solo" as const,
  teamId: null,
  sponsorAgentId: 8,
  affiliationTermMonths: 12,
  lockPlan: false,
  lockTeam: false,
  lockSponsor: true,
  lockTerm: false,
};

const teamInvitation = {
  kind: "team_recruiting",
  plan: "team_member" as const,
  teamId: 4,
  sponsorAgentId: 8,
  affiliationTermMonths: 12,
  lockPlan: true,
  lockTeam: true,
  lockSponsor: true,
  lockTerm: true,
};

assert.equal(requiresTeamJoinApproval({ plan: "team_member", teamId: 4 }), true);
assert.equal(requiresTeamJoinApproval({
  plan: "team_member",
  teamId: 4,
  invitation: personalReferral,
}), true);
assert.equal(hasPreapprovedTeamRouting(teamInvitation, 4), true);
assert.equal(requiresTeamJoinApproval({
  plan: "team_member",
  teamId: 4,
  invitation: teamInvitation,
}), false);
assert.equal(requiresTeamJoinApproval({ plan: "solo", teamId: null }), false);

assert.equal(canReuseAcceptedTeamRouting({
  requestedPlan: "team_member",
  requestedTeamId: 4,
  currentPlan: "team_member",
  currentTeamId: 4,
  currentConfigId: 9,
}), true);
assert.equal(canReuseAcceptedTeamRouting({
  requestedPlan: "team_member",
  requestedTeamId: 5,
  currentPlan: "team_member",
  currentTeamId: 4,
  currentConfigId: 9,
}), false);
assert.equal(canReuseAcceptedTeamRouting({
  requestedPlan: "team_member",
  requestedTeamId: 4,
  currentPlan: "solo",
  currentTeamId: null,
  currentConfigId: null,
}), false);

assert.equal(canDecideTeamJoinRequest({
  isAdmin: false,
  actorAgentId: 11,
  teamLeaderAgentId: 11,
}), true);
assert.equal(canDecideTeamJoinRequest({
  isAdmin: false,
  actorAgentId: 12,
  teamLeaderAgentId: 11,
}), false);
assert.equal(canDecideTeamJoinRequest({
  isAdmin: true,
  actorAgentId: 1,
  teamLeaderAgentId: 11,
}), true);

assert.equal(teamDeletionBlocker({ hasMembers: true, hasApplications: true }), "has_members");
assert.equal(teamDeletionBlocker({ hasMembers: false, hasApplications: true }), "has_applications");
assert.equal(teamDeletionBlocker({ hasMembers: false, hasApplications: false }), null);

console.log("team join request tests passed");
