import assert from "node:assert/strict";
import type { ESignTemplate, ESignTemplateField } from "../esign";
import {
  OnboardingESignTemplateError,
  validateOnboardingESignTemplate,
  validateTeamLeaderESignTemplate,
} from "../onboarding-esign-policy";

const VERSION_ID = "version-approved";
const SCHEMA_HASH = "schema-approved";
const BASE_KEYS = [
  "agent_id",
  "agent_name",
  "agent_email",
  "agent_phone",
  "license_number",
  "licensed_company",
  "compensation_plan",
  "split_pct",
  "sponsor_name",
  "affiliation_term_months",
];
const TEAM_KEYS = [
  "team_name",
  "team_split_pct",
  "team_sourced_split_pct",
  "team_cap_usd",
  "team_terms_effective_from",
];
const TEAM_LEADER_KEYS = [
  "agent_id", "agent_name", "agent_email", "agent_phone", "license_number",
  "licensed_company", "compensation_plan", "team_name", "expected_member_count",
  "team_positioning", "team_split_pct", "team_sourced_split_pct", "team_cap_usd",
  "team_terms_effective_from",
];

function field(mergeKey: string, overrides: Partial<ESignTemplateField> = {}): ESignTemplateField {
  return {
    id: `field-${mergeKey}`,
    type: "text",
    readOnly: true,
    required: false,
    mergeKey,
    ...overrides,
  };
}

function template(overrides: Partial<ESignTemplate["versions"][number]> = {}): ESignTemplate {
  return {
    id: "template-onboarding",
    activeVersionId: VERSION_ID,
    versions: [{
      id: VERSION_ID,
      status: "PUBLISHED",
      businessDomain: "HR",
      jurisdiction: "NY",
      approvalRequired: false,
      schemaHash: SCHEMA_HASH,
      roles: [{ id: "agent-role", name: "Agent", kind: "signer" }],
      fields: [...BASE_KEYS, ...TEAM_KEYS].map((key) => field(key)),
      ...overrides,
    }],
  };
}

function validate(value: ESignTemplate, includeTeamTerms = false) {
  return validateOnboardingESignTemplate({
    template: value,
    expectedVersionId: VERSION_ID,
    expectedSchemaHash: SCHEMA_HASH,
    includeTeamTerms,
  });
}

assert.equal(validate(template()).signerRole.id, "agent-role");
assert.equal(validate(template(), true).version.schemaHash, SCHEMA_HASH);

assert.throws(
  () => validate(template({ schemaHash: "changed" })),
  OnboardingESignTemplateError,
);

assert.equal(validateTeamLeaderESignTemplate({
  template: template({ fields: TEAM_LEADER_KEYS.map((key) => field(key)) }),
  expectedVersionId: VERSION_ID,
  expectedSchemaHash: SCHEMA_HASH,
}).signerRole.id, "agent-role");
assert.throws(() => validateTeamLeaderESignTemplate({
  template: template({ fields: TEAM_LEADER_KEYS.filter((key) => key !== "team_positioning").map((key) => field(key)) }),
  expectedVersionId: VERSION_ID,
  expectedSchemaHash: SCHEMA_HASH,
}), /team_positioning/);
assert.throws(
  () => validate({ ...template(), activeVersionId: "unreviewed" }),
  OnboardingESignTemplateError,
);
assert.throws(
  () => validate(template({ businessDomain: "REAL_ESTATE" })),
  OnboardingESignTemplateError,
);
assert.throws(
  () => validate(template({ fields: BASE_KEYS.filter((key) => key !== "split_pct").map((key) => field(key)) })),
  /split_pct/,
);
assert.throws(
  () => validate(template({ fields: [...BASE_KEYS, ...TEAM_KEYS]
    .map((key) => field(key, key === "compensation_plan" ? { readOnly: false } : {})) })),
  /compensation_plan/,
);
assert.throws(
  () => validate(template({ fields: BASE_KEYS.map((key) => field(key)) }), true),
  /team_name/,
);

console.log("onboarding eSign policy tests passed");
