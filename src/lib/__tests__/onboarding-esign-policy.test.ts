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
    stableField("agent.plan_signed_date", 2, "signed_date", "agent-role"),
    stableField("company.plan_countersignature", 2, "signature", "company-role"),
    stableField("company.plan_countersigned_date", 2, "signed_date", "company-role"),
    stableField("agent.reporting_acknowledgement", 3, "checkbox", "agent-role"),
    stableField("agent.reporting_signature", 3, "signature", "agent-role"),
    stableField("agent.reporting_signed_date", 3, "signed_date", "agent-role"),
    stableField("company.reporting_countersignature", 3, "signature", "company-role"),
    stableField("company.reporting_countersigned_date", 3, "signed_date", "company-role"),
    stableField("agent.ica_address", 4, "text", "agent-role"),
    stableField("agent.ica_effective_date", 4, "signed_date", "agent-role"),
    stableField("agent.ica_signature", 12, "signature", "agent-role"),
    stableField("agent.ica_signed_date", 12, "signed_date", "agent-role"),
    stableField("company.ica_countersignature", 12, "signature", "company-role"),
    stableField("company.ica_countersigned_date", 12, "signed_date", "company-role"),
    stableField("agent.nda_signature", 18, "signature", "agent-role"),
    stableField("agent.nda_signed_date", 18, "signed_date", "agent-role"),
    stableField("company.nda_countersignature", 18, "signature", "company-role"),
    stableField("company.nda_countersigned_date", 18, "signed_date", "company-role"),
  ];
  const realtyFields = [
    stableField("realty.libor_legal_name", 19, "text", "agent-role"),
    stableField("realty.libor_office_name", 19, "text", "agent-role"),
    stableField("realty.libor_office_address", 19, "text", "agent-role"),
    stableField("realty.libor_office_town", 19, "text", "agent-role"),
    stableField("realty.libor_office_state", 19, "text", "agent-role"),
    stableField("realty.libor_office_zip", 19, "text", "agent-role"),
    stableField("realty.libor_office_phone", 19, "text", "agent-role"),
    stableField("realty.libor_fax", 19, "text", "agent-role"),
    stableField("realty.libor_email", 19, "text", "agent-role"),
    stableField("realty.libor_web_address", 19, "text", "agent-role"),
    stableField("realty.libor_date_of_birth", 19, "text", "agent-role"),
    stableField("realty.libor_preferred_mailing", 19, "text", "agent-role"),
    stableField("realty.libor_residence_address", 19, "text", "agent-role"),
    stableField("realty.libor_residence_town", 19, "text", "agent-role"),
    stableField("realty.libor_residence_state", 19, "text", "agent-role"),
    stableField("realty.libor_residence_zip", 19, "text", "agent-role"),
    stableField("realty.libor_home_phone", 19, "text", "agent-role"),
    stableField("realty.libor_cell_phone", 19, "text", "agent-role"),
    stableField("realty.libor_preferred_phone", 19, "text", "agent-role"),
    stableField("realty.libor_primary_field", 19, "text", "agent-role"),
    stableField("realty.libor_secondary_field", 19, "text", "agent-role"),
    stableField("realty.libor_commercial_activity", 19, "text", "agent-role"),
    stableField("realty.libor_prior_board", 19, "text", "agent-role"),
    stableField("realty.libor_prior_board_name", 19, "text", "agent-role"),
    stableField("realty.libor_nrds_number", 19, "text", "agent-role"),
    stableField("realty.libor_text_consent", 19, "text", "agent-role"),
    stableField("realty.libor_marketing_consent", 19, "text", "agent-role"),
    stableField("realty.libor_application_signature", 19, "signature", "agent-role"),
    stableField("realty.libor_application_signed_date", 19, "signed_date", "agent-role"),
    stableField("realty.fees_acknowledgement", 21, "checkbox", "agent-role"),
    stableField("realty.fees_initials", 21, "initials", "agent-role"),
    stableField("realty.fees_signature", 21, "signature", "agent-role"),
    stableField("realty.fees_signed_date", 21, "signed_date", "agent-role"),
    stableField("company.realty_fees_countersignature", 21, "signature", "company-role"),
    stableField("company.realty_fees_countersigned_date", 21, "signed_date", "company-role"),
  ];
  return realty ? [...common, ...realtyFields] : common;
}

function teamLeaderStableFields() {
  return [
    stableField("team.config_acknowledgement", 2, "checkbox", "agent-role"),
    stableField("team.config_initials", 2, "initials", "agent-role"),
    stableField("team.execution_acknowledgement", 7, "checkbox", "agent-role"),
    stableField("team.leader_signature", 7, "signature", "agent-role"),
    stableField("team.leader_signed_date", 7, "signed_date", "agent-role"),
    stableField("company.team_leader_countersignature", 7, "signature", "company-role"),
    stableField("company.team_leader_countersigned_date", 7, "signed_date", "company-role"),
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
      documents: [{ id: "document-onboarding", pageCount: 18 }],
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
assert.equal(validateOnboardingESignTemplate({
  template: template({
    documents: [{ id: "document-onboarding-realty", pageCount: 21 }],
    fields: [
      ...[...BASE_KEYS, ...TEAM_KEYS].map((key) => field(key, key === "compensation_plan"
        ? {
            fieldKey: "agent.compensation_plan",
            page: 2,
            type: "merge",
            required: true,
          }
        : {})),
      ...agentStableFields(true),
    ],
  }),
  expectedVersionId: VERSION_ID,
  expectedSchemaHash: SCHEMA_HASH,
  includeTeamTerms: true,
  entityKey: "homix_realty",
}).version.documents[0].pageCount, 21);

assert.throws(
  () => validate(template({ schemaHash: "changed" })),
  OnboardingESignTemplateError,
);

assert.equal(validateTeamLeaderESignTemplate({
  template: template({ documents: [{ id: "document-team-leader", pageCount: 7 }], fields: [
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
  template: template({ documents: [{ id: "document-team-leader", pageCount: 7 }], fields: [
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
  /18-page PDF/,
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
