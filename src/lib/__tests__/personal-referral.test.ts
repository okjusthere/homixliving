import assert from "node:assert/strict";
import { personalReferralToken } from "../personal-referral-token";
import { loginHandoffUrl } from "../invitation-handoff";
import { applyInvitationRouting, defaultInvitationLocks } from "../onboarding-routing";

const token = personalReferralToken(8, 42, "local-test-secret");
assert.match(token, /^[A-Za-z0-9_-]{43}$/);
assert.equal(token, personalReferralToken(8, 42, "local-test-secret"));
assert.notEqual(token, personalReferralToken(9, 42, "local-test-secret"));
assert.notEqual(token, personalReferralToken(8, 43, "local-test-secret"));
assert.notEqual(token, personalReferralToken(8, 42, "rotated-secret"));
assert.throws(() => personalReferralToken(8, 42, ""));
assert.throws(() => personalReferralToken(-1, 42, "secret"));

// A WeChat-to-Safari handoff must revisit /join/[token], setting the invite
// cookie in the new browser rather than silently taking the direct join path.
assert.equal(
  loginHandoffUrl(`https://agents.example.com/login?apply=1&invitation=${token}&lang=zh&source=homix-web`),
  `https://agents.example.com/join/${token}?lang=zh`,
);
assert.equal(
  loginHandoffUrl("https://agents.example.com/login?apply=1&source=homix-web&plan=solo_pro&lang=en"),
  "https://agents.example.com/join/start?source=homix-web&lang=en&plan=solo_pro",
);
assert.equal(loginHandoffUrl("https://agents.example.com/login?switchAccount=1"), "https://agents.example.com/login?switchAccount=1");
assert.equal(new URL(loginHandoffUrl("https://agents.example.com/login?apply=1&invitation=../../evil")).pathname, "/join/start");

const locks = defaultInvitationLocks("personal_referral");
assert.deepEqual(applyInvitationRouting({ plan: "team_member", teamId: 99, sponsorAgentId: 666, affiliationTermMonths: 24 }, {
  plan: "solo", teamId: null, sponsorAgentId: 42, affiliationTermMonths: 12,
  lockSponsor: locks.sponsor, lockPlan: locks.plan, lockTeam: locks.team, lockTerm: locks.term,
}), { plan: "team_member", teamId: 99, sponsorAgentId: 42, affiliationTermMonths: 24 });

console.log("personal referral and browser handoff tests passed");
