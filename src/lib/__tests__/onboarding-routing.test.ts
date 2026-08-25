import assert from "node:assert/strict";
import {
  applyInvitationRouting,
  defaultInvitationLocks,
} from "../onboarding-routing";

const requested = {
  plan: "solo_pro" as const,
  teamId: null,
  sponsorAgentId: null,
  affiliationTermMonths: 12,
};

assert.deepEqual(defaultInvitationLocks("personal_referral"), {
  plan: false,
  team: false,
  sponsor: true,
  term: false,
});

assert.deepEqual(defaultInvitationLocks("admin", { sponsorAgentId: null }), {
  plan: true,
  team: false,
  sponsor: true,
  term: true,
});

assert.deepEqual(
  applyInvitationRouting(requested, {
    plan: "solo",
    teamId: null,
    sponsorAgentId: 42,
    affiliationTermMonths: 24,
    lockPlan: false,
    lockTeam: false,
    lockSponsor: true,
    lockTerm: false,
  }),
  { ...requested, sponsorAgentId: 42 },
);

assert.deepEqual(
  applyInvitationRouting(requested, {
    plan: "team_member",
    teamId: 7,
    sponsorAgentId: 9,
    affiliationTermMonths: 12,
    lockPlan: true,
    lockTeam: true,
    lockSponsor: true,
    lockTerm: true,
  }),
  {
    plan: "team_member",
    teamId: 7,
    sponsorAgentId: 9,
    affiliationTermMonths: 12,
  },
);

console.log("onboarding routing tests passed");
