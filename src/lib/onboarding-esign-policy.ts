import type {
  ESignTemplate,
  ESignTemplateField,
  ESignTemplateVersion,
} from "@/lib/esign";

const BASE_MERGE_KEYS = [
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
] as const;

const TEAM_MERGE_KEYS = [
  "team_name",
  "team_split_pct",
  "team_sourced_split_pct",
  "team_cap_usd",
  "team_terms_effective_from",
] as const;

export class OnboardingESignTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnboardingESignTemplateError";
  }
}

export function validateOnboardingESignTemplate(input: {
  template: ESignTemplate;
  expectedVersionId: string;
  expectedSchemaHash: string;
  includeTeamTerms: boolean;
}) {
  const { template, expectedVersionId, expectedSchemaHash, includeTeamTerms } = input;
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

  const signerRoles = version.roles.filter((role) => role.kind === "signer");
  if (signerRoles.length !== 1) {
    throw new OnboardingESignTemplateError(
      "The onboarding template must contain exactly one agent signer role.",
    );
  }
  const countersignerRoles = version.roles.filter((role) => role.kind === "countersigner");
  if (countersignerRoles.length > 1) {
    throw new OnboardingESignTemplateError(
      "The onboarding template may contain at most one company countersigner role.",
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

  const requiredKeys = includeTeamTerms
    ? [...BASE_MERGE_KEYS, ...TEAM_MERGE_KEYS]
    : [...BASE_MERGE_KEYS];
  const mergeFields = new Map<string, ESignTemplateField[]>();
  for (const field of version.fields) {
    if (!field.mergeKey) continue;
    const fields = mergeFields.get(field.mergeKey) || [];
    fields.push(field);
    mergeFields.set(field.mergeKey, fields);
  }
  for (const key of requiredKeys) {
    const fields = mergeFields.get(key) || [];
    if (fields.length !== 1 || !fields[0].readOnly) {
      throw new OnboardingESignTemplateError(
        `The onboarding template must contain one read-only ${key} merge field.`,
      );
    }
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
