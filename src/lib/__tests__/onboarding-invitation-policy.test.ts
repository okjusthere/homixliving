import assert from "node:assert/strict";
import { canAssignInvitationSponsor } from "../onboarding-invitation-policy";

const activeMember = { id: 7, teamId: 3, accountStatus: "active" as const };

assert.equal(canAssignInvitationSponsor({
  kind: "team_recruiting",
  isAdmin: false,
  actorAgentId: 5,
  targetTeamId: 3,
  targetTeamLeaderId: 5,
  candidate: activeMember,
}), true);

assert.equal(canAssignInvitationSponsor({
  kind: "team_recruiting",
  isAdmin: false,
  actorAgentId: 5,
  targetTeamId: 3,
  targetTeamLeaderId: 5,
  candidate: { ...activeMember, teamId: 4 },
}), false);

assert.equal(canAssignInvitationSponsor({
  kind: "team_recruiting",
  isAdmin: false,
  actorAgentId: 5,
  targetTeamId: 3,
  targetTeamLeaderId: 5,
  candidate: { id: 5, teamId: null, accountStatus: "active" },
}), true);

assert.equal(canAssignInvitationSponsor({
  kind: "personal_referral",
  isAdmin: false,
  actorAgentId: 5,
  targetTeamId: null,
  targetTeamLeaderId: null,
  candidate: { id: 7, teamId: 3, accountStatus: "active" },
}), false);

assert.equal(canAssignInvitationSponsor({
  kind: "admin",
  isAdmin: true,
  actorAgentId: 1,
  targetTeamId: null,
  targetTeamLeaderId: null,
  candidate: { id: 9, teamId: null, accountStatus: "active" },
}), true);

assert.equal(canAssignInvitationSponsor({
  kind: "admin",
  isAdmin: true,
  actorAgentId: 1,
  targetTeamId: null,
  targetTeamLeaderId: null,
  candidate: { id: 9, teamId: null, accountStatus: "inactive" },
}), false);

console.log("onboarding invitation policy tests passed");
