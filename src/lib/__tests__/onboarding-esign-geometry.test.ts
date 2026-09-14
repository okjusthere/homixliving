import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertValidGeometry,
  mergePlacements,
  stableFieldRect,
} from "../../../scripts/onboarding-esign-geometry";
import { onboardingImportFields, nativeFieldInput } from "../../../scripts/export-documenso-onboarding-packages";

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
  "libor_membership_status",
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

const nativeManifest = JSON.parse(readFileSync(new URL("../../../contracts/field-manifests.yml", import.meta.url), "utf8"));
const contract = { file: "synthetic.pdf", sha256: "", pages: 21, entity: "Homix Realty Inc.", agreement: "agent" as const, plan: "solo" as const };
const newMemberFields = onboardingImportFields(contract, nativeManifest, "apply_new");
const legalName = newMemberFields.find((field) => field.key === "realty.libor_legal_name")!;
assert.equal(legalName.mergeKey, "agent_name", "Use the same verified legal name on the appendix");
assert.equal(nativeFieldInput(legalName).fieldMeta.readOnly, true);
assert.equal(nativeFieldInput(legalName).fieldMeta.required, false, "Do not ask the signer to retype known legal identity");
const cellPhone = newMemberFields.find((field) => field.key === "realty.libor_cell_phone")!;
assert.equal(cellPhone.mergeKey, "agent_phone");
assert.equal(nativeFieldInput(cellPhone).fieldMeta.readOnly, false);
assert.equal(nativeFieldInput(cellPhone).fieldMeta.required, true, "Missing phone can still be completed by the signer");
for (const key of ["realty.libor_home_phone", "realty.libor_secondary_field", "realty.libor_prior_board_name", "realty.libor_nrds_number"])
  assert.equal(nativeFieldInput(newMemberFields.find((field) => field.key === key)!).fieldMeta.required, false, key);
const existingMemberFields = onboardingImportFields(contract, nativeManifest, "existing_member");
assert.equal(existingMemberFields.some((field) => field.key.startsWith("realty.libor_")), false, "Existing members are not asked to complete new membership fields");
for (const key of ["agent_id", "agent_name", "sponsor_name", "team_name"]) {
  const businessFields = existingMemberFields.filter((field) => field.mergeKey === key);
  assert.ok(businessFields.length);
  for (const field of businessFields) {
    assert.equal(nativeFieldInput(field).fieldMeta.readOnly, true);
    assert.equal(nativeFieldInput(field).fieldMeta.required, false);
  }
}

console.log("onboarding eSign geometry tests passed");
