type ESignRole = {
  id: string;
  name: string;
  kind: "signer" | "approver" | "countersigner" | "viewer" | "copy";
};

type ESignTemplateVersion = {
  id: string;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  approvalRequired: boolean;
  roles: ESignRole[];
};

export type ESignTemplate = {
  id: string;
  activeVersionId?: string;
  versions: ESignTemplateVersion[];
};

export type ESignEnvelope = {
  id: string;
  transactionId?: string;
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

type ApiResult<T> = { data: T };

function config() {
  return {
    baseUrl: process.env.ESIGN_API_URL?.trim().replace(/\/+$/, "") || "",
    applicationKey: process.env.ESIGN_APPLICATION_KEY?.trim() || "",
    templateId: process.env.ESIGN_ONBOARDING_TEMPLATE_ID?.trim() || "",
  };
}

export function isOnboardingESignConfigured() {
  const value = config();
  return Boolean(value.baseUrl && value.applicationKey && value.templateId);
}

export function onboardingESignTemplateId() {
  return config().templateId;
}

async function esignRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const value = config();
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
    throw new Error(message || `eSign request failed (${response.status}).`);
  }
  return body.data;
}

export function getESignTemplate(templateId: string) {
  return esignRequest<ESignTemplate>(`/v1/templates/${encodeURIComponent(templateId)}`);
}

export function getESignEnvelope(envelopeId: string) {
  return esignRequest<ESignEnvelope>(`/v1/envelopes/${encodeURIComponent(envelopeId)}`);
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

export function createESignEnvelope(input: {
  transactionId: string;
  templateId: string;
  agentId: number;
  name: string;
  email: string;
  roleId: string;
  mergeData: Record<string, string | number | boolean>;
}) {
  const expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
  return esignRequest<ESignEnvelope>("/v1/envelopes", {
    method: "POST",
    headers: { "idempotency-key": `homix-onboarding-agent-${input.agentId}` },
    body: JSON.stringify({
      templateId: input.templateId,
      transactionId: input.transactionId,
      externalReference: `homix-onboarding-agent-${input.agentId}`,
      subject: "Homix agent affiliation agreement",
      message: "Please review and sign your Homix affiliation agreement.",
      expiresAt,
      recipients: [{ roleId: input.roleId, name: input.name, email: input.email }],
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
