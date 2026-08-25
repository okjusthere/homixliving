type ESignRole = {
  id: string;
  name: string;
  kind: "signer" | "approver" | "countersigner" | "viewer" | "copy";
};

export type ESignTemplateField = {
  id: string;
  type: string;
  readOnly: boolean;
  required: boolean;
  mergeKey?: string;
};

export type ESignTemplateVersion = {
  id: string;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  businessDomain: "HR" | "REAL_ESTATE";
  jurisdiction: string;
  approvalRequired: boolean;
  roles: ESignRole[];
  fields: ESignTemplateField[];
  schemaHash?: string;
};

export type ESignTemplate = {
  id: string;
  activeVersionId?: string;
  versions: ESignTemplateVersion[];
};

export type ESignEnvelope = {
  id: string;
  transactionId?: string;
  templateVersionId: string;
  evidencePackageId?: string;
  status:
    | "DRAFT"
    | "PREPARED"
    | "APPROVAL_PENDING"
    | "READY_TO_SEND"
    | "SENT"
    | "IN_PROGRESS"
    | "FINALIZING"
    | "COMPLETED"
    | "DECLINED"
    | "VOIDED"
    | "EXPIRED"
    | "FAILED_FINALIZATION";
  completedAt?: string;
};

export type ESignEvidence = {
  id: string;
  verificationStatus: "VERIFIED" | "FAILED";
};

export type ESignTransaction = {
  id: string;
  externalReference?: string;
};

export type ESignRecipientInput = {
  roleId: string;
  name: string;
  email: string;
};

type ApiResult<T> = { data: T };

export type OnboardingESignEntityKey = "homix_realty" | "homix_living";

type OnboardingESignEntity = {
  key: OnboardingESignEntityKey;
  legalName: string;
  envPrefix: "ESIGN_ONBOARDING_HOMIX_REALTY" | "ESIGN_ONBOARDING_HOMIX_LIVING";
  aliases: readonly string[];
};

const ONBOARDING_ESIGN_ENTITIES: readonly OnboardingESignEntity[] = [
  {
    key: "homix_realty",
    legalName: "Homix Realty Inc.",
    envPrefix: "ESIGN_ONBOARDING_HOMIX_REALTY",
    aliases: ["homix realty", "homix realty inc", "homix realty incorporated"],
  },
  {
    key: "homix_living",
    legalName: "Homix Living Inc.",
    envPrefix: "ESIGN_ONBOARDING_HOMIX_LIVING",
    aliases: ["homix living", "homix living inc", "homix living incorporated"],
  },
] as const;

function normalizeLegalEntity(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveOnboardingESignEntity(
  licensedCompany: string | null | undefined,
) {
  const normalized = normalizeLegalEntity(licensedCompany);
  return ONBOARDING_ESIGN_ENTITIES.find((entity) => entity.aliases.includes(normalized)) || null;
}

function apiConfig() {
  return {
    baseUrl: process.env.ESIGN_API_URL?.trim().replace(/\/+$/, "") || "",
    applicationKey: process.env.ESIGN_APPLICATION_KEY?.trim() || "",
  };
}

export function onboardingESignTemplateConfiguration(
  licensedCompany: string | null | undefined,
) {
  const entity = resolveOnboardingESignEntity(licensedCompany);
  if (!entity) return null;
  const read = (suffix: string) => process.env[`${entity.envPrefix}_${suffix}`]?.trim() || "";
  return {
    entityKey: entity.key,
    legalEntityName: entity.legalName,
    templateId: read("TEMPLATE_ID"),
    templateVersionId: read("TEMPLATE_VERSION_ID"),
    templateSchemaHash: read("TEMPLATE_SCHEMA_HASH"),
    countersignerName: read("COUNTERSIGNER_NAME"),
    countersignerEmail: read("COUNTERSIGNER_EMAIL"),
  };
}

class ESignApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ESignApiError";
  }
}

export function isOnboardingESignConfigured(
  licensedCompany: string | null | undefined,
) {
  const api = apiConfig();
  const value = onboardingESignTemplateConfiguration(licensedCompany);
  return Boolean(
    value &&
      api.baseUrl &&
      api.applicationKey &&
      value.templateId &&
      value.templateVersionId &&
      value.templateSchemaHash,
  );
}

async function esignRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const value = apiConfig();
  if (!value.baseUrl || !value.applicationKey) {
    throw new Error("eSign onboarding is not configured.");
  }
  const response = await fetch(`${value.baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-esign-key": value.applicationKey,
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => null) as ApiResult<T> | { error?: { message?: string } } | null;
  if (!response.ok || !body || !("data" in body)) {
    const message = body && "error" in body ? body.error?.message : null;
    throw new ESignApiError(message || `eSign request failed (${response.status}).`, response.status);
  }
  return body.data;
}

export function getESignTemplate(templateId: string) {
  return esignRequest<ESignTemplate>(`/v1/templates/${encodeURIComponent(templateId)}`);
}

export function getESignEnvelope(envelopeId: string) {
  return esignRequest<ESignEnvelope>(`/v1/envelopes/${encodeURIComponent(envelopeId)}`);
}

export function getESignEvidence(envelopeId: string) {
  return esignRequest<ESignEvidence>(`/v1/envelopes/${encodeURIComponent(envelopeId)}/evidence`);
}

export function listESignTransactions() {
  return esignRequest<ESignTransaction[]>("/v1/transactions");
}

export function createESignTransaction(input: {
  name: string;
  externalReference: string;
}) {
  return esignRequest<{ id: string }>("/v1/transactions", {
    method: "POST",
    body: JSON.stringify({
      kind: "HR_PACKET",
      name: input.name,
      jurisdiction: "NY",
      externalReference: input.externalReference,
    }),
  });
}

export async function findOrCreateESignTransaction(input: {
  name: string;
  externalReference: string;
}) {
  const existing = (await listESignTransactions()).find(
    (transaction) => transaction.externalReference === input.externalReference,
  );
  if (existing) return existing;
  try {
    return await createESignTransaction(input);
  } catch (error) {
    if (!(error instanceof ESignApiError) || error.status !== 409) throw error;
    const raced = (await listESignTransactions()).find(
      (transaction) => transaction.externalReference === input.externalReference,
    );
    if (!raced) throw error;
    return raced;
  }
}

export function createESignEnvelope(input: {
  transactionId: string;
  templateId: string;
  legalEntityName: string;
  agentId: number;
  recipients: ESignRecipientInput[];
  mergeData: Record<string, string | number | boolean>;
  expectedTemplateVersionId: string;
  expectedTemplateSchemaHash: string;
}) {
  const expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
  return esignRequest<ESignEnvelope>("/v1/envelopes", {
    method: "POST",
    headers: { "idempotency-key": `homix-onboarding-agent-${input.agentId}` },
    body: JSON.stringify({
      templateId: input.templateId,
      expectedTemplateVersionId: input.expectedTemplateVersionId,
      expectedTemplateSchemaHash: input.expectedTemplateSchemaHash,
      transactionId: input.transactionId,
      externalReference: `homix-onboarding-agent-${input.agentId}`,
      subject: `${input.legalEntityName} agent affiliation agreement`,
      message: `Please review and sign your ${input.legalEntityName} affiliation agreement.`,
      expiresAt,
      recipients: input.recipients,
      mergeData: input.mergeData,
    }),
  });
}

export function sendESignEnvelope(envelopeId: string, agentId: number) {
  return esignRequest<{ envelope: ESignEnvelope; replayed: boolean }>(
    `/v1/envelopes/${encodeURIComponent(envelopeId)}/send`,
    {
      method: "POST",
      headers: { "idempotency-key": `homix-onboarding-send-agent-${agentId}` },
      body: "{}",
    },
  );
}
