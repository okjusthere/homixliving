import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertValidGeometry,
  mergePlacements,
  stableFieldRect,
} from "../../../scripts/onboarding-esign-geometry";

type ManifestField = { fieldKey: string; page: number };
type Manifest = {
  agent_common: ManifestField[];
  realty_agent_appendix: ManifestField[];
  team_leader_common: ManifestField[];
};

const manifest = JSON.parse(
  readFileSync(new URL("../../../contracts/field-manifests.yml", import.meta.url), "utf8"),
) as Manifest;

for (const field of [
  ...manifest.agent_common,
  ...manifest.realty_agent_appendix,
  ...manifest.team_leader_common,
]) {
  assert.doesNotThrow(() => stableFieldRect(field.fieldKey), field.fieldKey);
}

const agentPlacements = mergePlacements("agent");
const teamLeaderPlacements = mergePlacements("team_leader");
assertValidGeometry([
  ...agentPlacements.map((field) => ({ ...field, label: field.mergeKey })),
  ...teamLeaderPlacements.map((field) => ({ ...field, label: field.mergeKey })),
]);

for (const key of [
  "agent_id",
  "agent_name",
  "agent_email",
  "agent_phone",
  "license_number",
  "licensed_company",
  "practice",
  "compensation_plan",
  "split_pct",
  "sponsor_name",
  "affiliation_term_months",
  "team_name",
  "team_split_pct",
  "team_sourced_split_pct",
  "team_cap_usd",
  "team_terms_effective_from",
]) {
  const stableProvidesKey = key === "compensation_plan";
  assert.equal(
    stableProvidesKey || agentPlacements.some((field) => field.mergeKey === key),
    true,
    `Missing Agent Agreement placement for ${key}`,
  );
}

for (const key of [
  "agent_id",
  "agent_name",
  "agent_email",
  "agent_phone",
  "license_number",
  "licensed_company",
  "compensation_plan",
  "team_name",
  "expected_member_count",
  "team_positioning",
  "team_split_pct",
  "team_sourced_split_pct",
  "team_cap_usd",
  "team_terms_effective_from",
  "team_config_version",
]) {
  const stableProvidesKey = key === "compensation_plan";
  assert.equal(
    stableProvidesKey || teamLeaderPlacements.some((field) => field.mergeKey === key),
    true,
    `Missing Team Leader placement for ${key}`,
  );
}

assert.throws(() => stableFieldRect("unknown.field"), /No approved eSign rectangle/);

console.log("onboarding eSign geometry tests passed");
