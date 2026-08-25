import assert from "node:assert/strict";
import { recruitingInvitationState, teamRecruitingStage } from "../team-workspace";

const base = {
  accountStatus: "pending" as const,
  onboardingStage: "profile" as const,
  agreementStatus: "not_started" as const,
  paymentStatus: "pending" as const,
};

assert.equal(teamRecruitingStage(base), "profile");
assert.equal(teamRecruitingStage({ ...base, onboardingStage: "agreement", agreementStatus: "sent" }), "agreement");
assert.equal(teamRecruitingStage({ ...base, onboardingStage: "payment", agreementStatus: "completed" }), "payment");
assert.equal(teamRecruitingStage({ ...base, onboardingStage: "review", agreementStatus: "completed", paymentStatus: "paid" }), "review");
assert.equal(teamRecruitingStage({ ...base, accountStatus: "active" }), "complete");
assert.equal(teamRecruitingStage({ ...base, agreementStatus: "failed" }), "attention");

const now = new Date("2026-08-25T12:00:00Z");
assert.equal(recruitingInvitationState({ revokedAt: null, expiresAt: "2026-08-26T00:00:00Z", useCount: 0, maxUses: 1 }, now), "active");
assert.equal(recruitingInvitationState({ revokedAt: null, expiresAt: "2026-08-26T00:00:00Z", useCount: 1, maxUses: 1 }, now), "used");
assert.equal(recruitingInvitationState({ revokedAt: null, expiresAt: "2026-08-24T00:00:00Z", useCount: 0, maxUses: 1 }, now), "expired");
assert.equal(recruitingInvitationState({ revokedAt: "2026-08-23T00:00:00Z", expiresAt: "2026-08-26T00:00:00Z", useCount: 0, maxUses: 1 }, now), "revoked");

console.log("team workspace tests passed");
