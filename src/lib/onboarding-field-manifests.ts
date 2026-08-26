import type { OnboardingESignEntityKey, ESignTemplateVersion } from "@/lib/esign";

type RoleKind = ESignTemplateVersion["roles"][number]["kind"] | "none";

type FieldRequirement = {
  fieldKey: string;
  page: number;
  type: string;
  roleKind: RoleKind;
  readOnly?: boolean;
  mergeKey?: string;
};

const AGENT_COMMON: readonly FieldRequirement[] = [
  { fieldKey: "agent.plan_acknowledgement", page: 2, type: "checkbox", roleKind: "signer" },
  { fieldKey: "agent.plan_signature", page: 2, type: "signature", roleKind: "signer" },
  { fieldKey: "agent.plan_signed_date", page: 2, type: "date", roleKind: "signer" },
  { fieldKey: "agent.ica_signature", page: 5, type: "signature", roleKind: "signer" },
  { fieldKey: "agent.ica_signed_date", page: 5, type: "date", roleKind: "signer" },
  { fieldKey: "company.ica_countersignature", page: 5, type: "signature", roleKind: "countersigner" },
  { fieldKey: "company.ica_countersigned_date", page: 5, type: "date", roleKind: "countersigner" },
  { fieldKey: "agent.nda_signature", page: 7, type: "signature", roleKind: "signer" },
  { fieldKey: "agent.nda_signed_date", page: 7, type: "date", roleKind: "signer" },
  {
    fieldKey: "agent.compensation_plan",
    page: 2,
    type: "merge",
    roleKind: "none",
    readOnly: true,
    mergeKey: "compensation_plan",
  },
];

const REALTY_AGENT_APPENDIX: readonly FieldRequirement[] = [
  { fieldKey: "realty.libor_acknowledgement", page: 8, type: "checkbox", roleKind: "signer" },
  { fieldKey: "realty.libor_legal_name", page: 8, type: "text", roleKind: "signer" },
  { fieldKey: "realty.libor_license_number", page: 8, type: "text", roleKind: "signer" },
  { fieldKey: "realty.libor_home_address", page: 8, type: "text", roleKind: "signer" },
  { fieldKey: "realty.libor_phone", page: 8, type: "text", roleKind: "signer" },
  { fieldKey: "realty.libor_email", page: 8, type: "text", roleKind: "signer" },
  { fieldKey: "realty.libor_initials", page: 8, type: "initials", roleKind: "signer" },
  { fieldKey: "realty.libor_signature", page: 8, type: "signature", roleKind: "signer" },
  { fieldKey: "realty.libor_signed_date", page: 8, type: "date", roleKind: "signer" },
];

const TEAM_LEADER_COMMON: readonly FieldRequirement[] = [
  { fieldKey: "team.config_acknowledgement", page: 2, type: "checkbox", roleKind: "signer" },
  { fieldKey: "team.config_initials", page: 2, type: "initials", roleKind: "signer" },
  { fieldKey: "team.leader_signature", page: 4, type: "signature", roleKind: "signer" },
  { fieldKey: "team.leader_signed_date", page: 4, type: "date", roleKind: "signer" },
  { fieldKey: "company.team_leader_countersignature", page: 4, type: "signature", roleKind: "countersigner" },
  { fieldKey: "company.team_leader_countersigned_date", page: 4, type: "date", roleKind: "countersigner" },
  {
    fieldKey: "team.compensation_plan",
    page: 2,
    type: "merge",
    roleKind: "none",
    readOnly: true,
    mergeKey: "compensation_plan",
  },
];

export function agentAgreementFieldManifest(entityKey: OnboardingESignEntityKey) {
  return entityKey === "homix_realty"
    ? [...AGENT_COMMON, ...REALTY_AGENT_APPENDIX]
    : [...AGENT_COMMON];
}

export function teamLeaderAgreementFieldManifest() {
  return [...TEAM_LEADER_COMMON];
}

export function validateStableFieldManifest(input: {
  version: ESignTemplateVersion;
  requirements: readonly FieldRequirement[];
  forbidRealtyFields?: boolean;
}) {
  const byKey = new Map<string, ESignTemplateVersion["fields"]>();
  for (const field of input.version.fields) {
    if (!field.fieldKey) continue;
    const existing = byKey.get(field.fieldKey) || [];
    existing.push(field);
    byKey.set(field.fieldKey, existing);
  }
  const roles = new Map(input.version.roles.map((role) => [role.id, role]));
  const approvedKeys = new Set(input.requirements.map((requirement) => requirement.fieldKey));
  const unexpected = input.version.fields.find(
    (field) => field.fieldKey && !approvedKeys.has(field.fieldKey),
  );
  if (unexpected?.fieldKey) {
    throw new Error(`Template contains unapproved stable field ${unexpected.fieldKey}.`);
  }
  for (const requirement of input.requirements) {
    const fields = byKey.get(requirement.fieldKey) || [];
    if (fields.length !== 1) {
      throw new Error(`Template must contain exactly one ${requirement.fieldKey} field.`);
    }
    const field = fields[0];
    const roleKind = field.roleId ? roles.get(field.roleId)?.kind : "none";
    if (
      !field.required ||
      field.page !== requirement.page ||
      field.type !== requirement.type ||
      roleKind !== requirement.roleKind ||
      (requirement.readOnly !== undefined && field.readOnly !== requirement.readOnly) ||
      (requirement.mergeKey !== undefined && field.mergeKey !== requirement.mergeKey)
    ) {
      throw new Error(`Template field ${requirement.fieldKey} does not match its approved manifest.`);
    }
  }
  if (input.forbidRealtyFields) {
    const prohibited = input.version.fields.find((field) =>
      field.fieldKey?.startsWith("realty.") ||
      /\b(libor|onekey|mls)\b/i.test(`${field.fieldKey || ""} ${field.mergeKey || ""} ${field.label || ""}`),
    );
    if (prohibited) {
      throw new Error("Living templates must not contain LIBOR, OneKey, or MLS fields.");
    }
  }
}
