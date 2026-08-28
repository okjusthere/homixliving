import type {
  ESignTemplate,
  ESignTemplateField,
  ESignTemplateVersion,
} from "@/lib/esign";
import type { OnboardingESignEntityKey } from "@/lib/esign";
import type { LiborMembershipStatus } from "@/lib/licensed-companies";
import {
  agentAgreementFieldManifest,
  teamLeaderAgreementFieldManifest,
  validateStableFieldManifest,
} from "@/lib/onboarding-field-manifests";

const BASE_MERGE_KEYS = [
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
] as const;

const TEAM_MERGE_KEYS = [
  "team_name",
  "team_split_pct",
  "team_sourced_split_pct",
  "team_cap_usd",
  "team_terms_effective_from",
] as const;

const TEAM_LEADER_MERGE_KEYS = [
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
] as const;

export class OnboardingESignTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnboardingESignTemplateError";
  }
}

function validateSingleDocument(version: ESignTemplateVersion, expectedPageCount: number) {
  if (version.documents.length !== 1 || version.documents[0].pageCount !== expectedPageCount) {
    throw new OnboardingESignTemplateError(
      `The template must contain one ${expectedPageCount}-page PDF.`,
    );
  }
}

export function validateOnboardingESignTemplate(input: {
  template: ESignTemplate;
  expectedVersionId: string;
  expectedSchemaHash: string;
  includeTeamTerms: boolean;
  entityKey: OnboardingESignEntityKey;
  liborMembershipStatus: LiborMembershipStatus | null;
}) {
  const {
    template,
    expectedVersionId,
    expectedSchemaHash,
    includeTeamTerms,
    entityKey,
    liborMembershipStatus,
  } = input;
  if (template.activeVersionId !== expectedVersionId) {
    throw new OnboardingESignTemplateError(
      "The active onboarding template version has not been approved for Portal.",
    );
  }
  const version = template.versions.find((candidate) => candidate.id === expectedVersionId);
  if (!version || version.status !== "PUBLISHED") {
    throw new OnboardingESignTemplateError("The approved onboarding template is not published.");
  }
  if (!version.schemaHash || version.schemaHash !== expectedSchemaHash) {
    throw new OnboardingESignTemplateError(
      "The onboarding template schema does not match the approved version.",
    );
  }
  if (version.businessDomain !== "HR" || version.jurisdiction !== "NY") {
    throw new OnboardingESignTemplateError(
      "The onboarding template must be an HR template for New York.",
    );
  }
  if (version.approvalRequired) {
    throw new OnboardingESignTemplateError(
      "The onboarding template must not require preparer approval.",
    );
  }
  validateSingleDocument(version, entityKey === "homix_realty" ? 21 : 18);

  const signerRoles = version.roles.filter((role) => role.kind === "signer");
  if (signerRoles.length !== 1) {
    throw new OnboardingESignTemplateError(
      "The onboarding template must contain exactly one agent signer role.",
    );
  }
  const countersignerRoles = version.roles.filter((role) => role.kind === "countersigner");
  if (countersignerRoles.length !== 1) {
    throw new OnboardingESignTemplateError(
      "The onboarding template must contain exactly one company countersigner role.",
    );
  }
  const unsupportedRoles = version.roles.filter(
    (role) => role.kind !== "signer" && role.kind !== "countersigner",
  );
  if (unsupportedRoles.length > 0) {
    throw new OnboardingESignTemplateError(
      "The onboarding template contains unsupported recipient roles.",
    );
  }

  const requiredKeys: string[] = includeTeamTerms
    ? [...BASE_MERGE_KEYS, ...TEAM_MERGE_KEYS]
    : [...BASE_MERGE_KEYS];
  if (entityKey === "homix_realty") requiredKeys.push("libor_membership_status");
  const mergeFields = new Map<string, ESignTemplateField[]>();
  for (const field of version.fields) {
    if (!field.mergeKey) continue;
    const fields = mergeFields.get(field.mergeKey) || [];
    fields.push(field);
    mergeFields.set(field.mergeKey, fields);
  }
  for (const key of requiredKeys) {
    const fields = mergeFields.get(key) || [];
    if (fields.length === 0 || fields.some((field) => !field.readOnly)) {
      throw new OnboardingESignTemplateError(
        `The onboarding template must contain read-only ${key} merge fields.`,
      );
    }
  }
  try {
    validateStableFieldManifest({
      version,
      requirements: agentAgreementFieldManifest(entityKey, liborMembershipStatus),
      forbidRealtyFields: entityKey === "homix_living",
    });
  } catch (error) {
    throw new OnboardingESignTemplateError(
      error instanceof Error ? error.message : "The onboarding field manifest is invalid.",
    );
  }

  return {
    version,
    signerRole: signerRoles[0],
    countersignerRoles,
  } satisfies {
    version: ESignTemplateVersion;
    signerRole: ESignTemplateVersion["roles"][number];
    countersignerRoles: ESignTemplateVersion["roles"];
  };
}

export function validateTeamLeaderESignTemplate(input: {
  template: ESignTemplate;
  expectedVersionId: string;
  expectedSchemaHash: string;
  entityKey: OnboardingESignEntityKey;
}) {
  const { template, expectedVersionId, expectedSchemaHash } = input;
  if (template.activeVersionId !== expectedVersionId) {
    throw new OnboardingESignTemplateError("The active Team Leader template has not been approved for Portal.");
  }
  const version = template.versions.find((candidate) => candidate.id === expectedVersionId);
  if (!version || version.status !== "PUBLISHED" || version.schemaHash !== expectedSchemaHash) {
    throw new OnboardingESignTemplateError("The approved Team Leader template pin is invalid.");
  }
  if (version.businessDomain !== "HR" || version.jurisdiction !== "NY" || version.approvalRequired) {
    throw new OnboardingESignTemplateError("The Team Leader template must be a directly sendable NY HR template.");
  }
  validateSingleDocument(version, 7);
  const signerRoles = version.roles.filter((role) => role.kind === "signer");
  const countersignerRoles = version.roles.filter((role) => role.kind === "countersigner");
  const unsupportedRoles = version.roles.filter(
    (role) => role.kind !== "signer" && role.kind !== "countersigner",
  );
  if (signerRoles.length !== 1 || countersignerRoles.length !== 1 || unsupportedRoles.length) {
    throw new OnboardingESignTemplateError("The Team Leader template recipient roles are invalid.");
  }
  const mergeFields = new Map<string, ESignTemplateField[]>();
  for (const field of version.fields) {
    if (!field.mergeKey) continue;
    const fields = mergeFields.get(field.mergeKey) || [];
    fields.push(field);
    mergeFields.set(field.mergeKey, fields);
  }
  for (const key of TEAM_LEADER_MERGE_KEYS) {
    const fields = mergeFields.get(key) || [];
    if (fields.length === 0 || fields.some((field) => !field.readOnly)) {
      throw new OnboardingESignTemplateError(
        `The Team Leader template must contain read-only ${key} merge fields.`,
      );
    }
  }
  try {
    validateStableFieldManifest({
      version,
      requirements: teamLeaderAgreementFieldManifest(),
      forbidRealtyFields: input.entityKey === "homix_living",
    });
  } catch (error) {
    throw new OnboardingESignTemplateError(
      error instanceof Error ? error.message : "The Team Leader field manifest is invalid.",
    );
  }
  return { version, signerRole: signerRoles[0], countersignerRoles };
}
