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
    page: 1,
    type: "text",
    roleId: null,
    label: mergeKey,
    readOnly: true,
    required: false,
    mergeKey,
    ...overrides,
  };
}

function stableField(
  fieldKey: string,
  page: number,
  type: string,
  roleId: string | null,
  overrides: Partial<ESignTemplateField> = {},
): ESignTemplateField {
  return {
    id: `stable-${fieldKey}`,
    fieldKey,
    page,
    type,
    roleId,
    label: fieldKey,
    readOnly: roleId === null,
    required: true,
    ...overrides,
  };
}

function agentStableFields(realty = false) {
  const common = [
    stableField("agent.plan_acknowledgement", 2, "checkbox", "agent-role"),
    stableField("agent.plan_signature", 2, "signature", "agent-role"),
    stableField("agent.plan_signed_date", 2, "date", "agent-role"),
    stableField("agent.ica_signature", 5, "signature", "agent-role"),
    stableField("agent.ica_signed_date", 5, "date", "agent-role"),
    stableField("company.ica_countersignature", 5, "signature", "company-role"),
    stableField("company.ica_countersigned_date", 5, "date", "company-role"),
    stableField("agent.nda_signature", 7, "signature", "agent-role"),
    stableField("agent.nda_signed_date", 7, "date", "agent-role"),
  ];
  const realtyFields = [
    stableField("realty.libor_acknowledgement", 8, "checkbox", "agent-role"),
    stableField("realty.libor_legal_name", 8, "text", "agent-role"),
    stableField("realty.libor_license_number", 8, "text", "agent-role"),
    stableField("realty.libor_home_address", 8, "text", "agent-role"),
    stableField("realty.libor_phone", 8, "text", "agent-role"),
    stableField("realty.libor_email", 8, "text", "agent-role"),
    stableField("realty.libor_initials", 8, "initials", "agent-role"),
    stableField("realty.libor_signature", 8, "signature", "agent-role"),
    stableField("realty.libor_signed_date", 8, "date", "agent-role"),
  ];
  return realty ? [...common, ...realtyFields] : common;
}

function teamLeaderStableFields() {
  return [
    stableField("team.config_acknowledgement", 2, "checkbox", "agent-role"),
    stableField("team.config_initials", 2, "initials", "agent-role"),
    stableField("team.leader_signature", 4, "signature", "agent-role"),
    stableField("team.leader_signed_date", 4, "date", "agent-role"),
    stableField("company.team_leader_countersignature", 4, "signature", "company-role"),
    stableField("company.team_leader_countersigned_date", 4, "date", "company-role"),
  ];
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
      documents: [{ id: "document-onboarding", pageCount: 7 }],
      roles: [
        { id: "agent-role", name: "Agent", kind: "signer" },
        { id: "company-role", name: "Company", kind: "countersigner" },
      ],
      fields: [
        ...[...BASE_KEYS, ...TEAM_KEYS].map((key) => field(key, key === "compensation_plan"
          ? {
              fieldKey: "agent.compensation_plan",
              page: 2,
              type: "merge",
              required: true,
            }
          : {})),
        ...agentStableFields(),
      ],
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
    entityKey: "homix_living",
  });
}

assert.equal(validate(template()).signerRole.id, "agent-role");
assert.equal(validate(template()).countersignerRoles[0].id, "company-role");
assert.equal(validate(template(), true).version.schemaHash, SCHEMA_HASH);

assert.throws(
  () => validate(template({ schemaHash: "changed" })),
  OnboardingESignTemplateError,
);

assert.equal(validateTeamLeaderESignTemplate({
  template: template({ documents: [{ id: "document-team-leader", pageCount: 4 }], fields: [
    ...TEAM_LEADER_KEYS.map((key) => field(key, key === "compensation_plan"
      ? {
          fieldKey: "team.compensation_plan",
          page: 2,
          type: "merge",
          required: true,
        }
      : {})),
    ...teamLeaderStableFields(),
  ] }),
  expectedVersionId: VERSION_ID,
  expectedSchemaHash: SCHEMA_HASH,
  entityKey: "homix_living",
}).signerRole.id, "agent-role");
assert.throws(() => validateTeamLeaderESignTemplate({
  template: template({ documents: [{ id: "document-team-leader", pageCount: 4 }], fields: [
    ...TEAM_LEADER_KEYS.filter((key) => key !== "team_positioning").map((key) => field(key, key === "compensation_plan"
      ? {
          fieldKey: "team.compensation_plan",
          page: 2,
          type: "merge",
          required: true,
        }
      : {})),
    ...teamLeaderStableFields(),
  ] }),
  expectedVersionId: VERSION_ID,
  expectedSchemaHash: SCHEMA_HASH,
  entityKey: "homix_living",
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
assert.throws(
  () => validate(template({ roles: [{ id: "agent-role", name: "Agent", kind: "signer" }] })),
  /exactly one company countersigner/,
);
assert.throws(
  () => validate(template({ documents: [{ id: "wrong-document", pageCount: 8 }] })),
  /7-page PDF/,
);
assert.throws(
  () => validate(template({
    fields: [
      ...template().versions[0].fields,
      stableField("agent.unapproved_signature", 7, "signature", "agent-role"),
    ],
  })),
  /unapproved stable field/,
);

console.log("onboarding eSign policy tests passed");
