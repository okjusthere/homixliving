import assert from "node:assert/strict";
import {
  isTeamCapPreset,
  isTeamSourcedSplitPreset,
  isTeamSplitPreset,
} from "../team-compensation-policy";
import { teamTermsSelection } from "../team-terms";

const firstCycle = teamTermsSelection({
  effectiveDate: "2026-10-15",
  anniversaryStart: "2026-08-17",
  joinedAt: "2026-08-17",
  frozenConfigId: 12,
  frozenEffectiveFrom: "2026-08-17",
});
assert.equal(firstCycle.frozenConfigId, 12);
assert.equal(firstCycle.configCutoff, "2026-08-17");

const nextCycle = teamTermsSelection({
  effectiveDate: "2027-08-17",
  anniversaryStart: "2026-08-17",
  joinedAt: "2026-08-17",
  frozenConfigId: 12,
  frozenEffectiveFrom: "2026-08-17",
});
assert.equal(nextCycle.frozenConfigId, null);
assert.equal(nextCycle.configCutoff, "2027-08-17");

const existingMember = teamTermsSelection({
  effectiveDate: "2026-10-15",
  anniversaryStart: "2026-03-01",
  joinedAt: "2026-03-01",
  frozenConfigId: null,
  frozenEffectiveFrom: null,
});
assert.equal(existingMember.configCutoff, "2026-03-01");

assert.equal(isTeamSplitPreset(10), true);
assert.equal(isTeamSplitPreset(12), false);
assert.equal(isTeamSourcedSplitPreset(30), true);
assert.equal(isTeamSourcedSplitPreset(35), false);
assert.equal(isTeamCapPreset(null), true);
assert.equal(isTeamCapPreset(1_500_000), true);
assert.equal(isTeamCapPreset(1_200_000), false);

console.log("team terms tests passed");
