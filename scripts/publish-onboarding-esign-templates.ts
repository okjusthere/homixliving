import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type RoleKind = "signer" | "countersigner";
type Rect = { x: number; y: number; width: number; height: number; rotation: 0 };
type ManifestField = {
  fieldKey: string;
  page: number;
  type: string;
  role: RoleKind | null;
  required: boolean;
  readOnly?: boolean;
  mergeKey?: string;
};

type ReleaseContract = {
  file: string;
  pages: number;
  sha256: string;
  entity: "Homix Realty Inc." | "Homix Living Inc.";
  agreement: "agent" | "team_leader";
};
type FieldManifest = {
  agent_common: ManifestField[];
  realty_agent_appendix: ManifestField[];
  team_leader_common: ManifestField[];
};

type ApiResult<T> = { data: T };
type Template = {
  id: string;
  activeVersionId?: string;
  versions: Array<{
    id: string;
    status: string;
    documents: Array<{ id: string; pageCount: number; sha256: string }>;
    schemaHash?: string;
  }>;
};
type TemplateFieldPayload = {
  id: string;
  fieldKey?: string;
  documentId: string;
  page: number;
  type: string;
  roleId: string | null;
  label: string;
  required: boolean;
  readOnly: boolean;
  sensitive: boolean;
  tabIndex: number;
  rect: Rect;
  mergeKey?: string;
};

const baseUrl = required("ESIGN_API_URL").replace(/\/+$/, "");
const applicationKey = required("ESIGN_APPLICATION_KEY");
const returnUrl = process.env.ESIGN_PUBLISH_RETURN_URL || "https://agents.homixny.com/";
const outputFile = process.env.ESIGN_RELEASE_OUTPUT || "output/pdf/esign-production-pins.local.json";
const root = process.cwd();
let manifest: FieldManifest;

async function main() {
  manifest = JSON.parse(
    await readFile(path.join(root, "contracts/field-manifests.yml"), "utf8"),
  ) as FieldManifest;
  const release = JSON.parse(
    await readFile(path.join(root, "output/pdf/release-index.json"), "utf8"),
  ) as { contracts: ReleaseContract[] };

  const session = await createStaffSession();
  const pins: Record<string, unknown> = {};

  for (const contract of release.contracts) {
    const pdfPath = path.join(root, "output/pdf", contract.file);
    const bytes = await readFile(pdfPath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== contract.sha256) {
      throw new Error(`${contract.file} does not match the approved SHA-256.`);
    }
    const template = await createTemplate(contract, bytes, session);
    const draft = template.versions.at(-1);
    const document = draft?.documents[0];
    if (!draft || !document || document.pageCount !== contract.pages || document.sha256 !== digest) {
      throw new Error(`${contract.file} was not stored with the approved PDF metadata.`);
    }

    const signerId = randomUUID();
    const countersignerId = randomUUID();
    const fields = buildFields(contract, document.id, signerId, countersignerId);
    await staffRequest(
      `/v1/templates/${template.id}/versions/${draft.id}`,
      session,
      {
        method: "PATCH",
        body: JSON.stringify({
          roles: [
            { id: signerId, name: contract.agreement === "team_leader" ? "Team Leader" : "Agent", kind: "signer", routingOrder: 1 },
            { id: countersignerId, name: "Company Broker", kind: "countersigner", routingOrder: 2 },
          ],
          fields,
        }),
      },
    );
    const published = await staffRequest<{
      id: string;
      status: string;
      schemaHash: string;
    }>(
      `/v1/templates/${template.id}/versions/${draft.id}/publish`,
      session,
      { method: "POST", body: "{}" },
    );
    if (published.status !== "PUBLISHED" || !published.schemaHash) {
      throw new Error(`${contract.file} did not publish successfully.`);
    }
    const key = `${contract.entity === "Homix Realty Inc." ? "homix_realty" : "homix_living"}_${contract.agreement}`;
    pins[key] = {
      file: contract.file,
      sha256: digest,
      templateId: template.id,
      templateVersionId: published.id,
      templateSchemaHash: published.schemaHash,
    };
  }

  await writeFile(
    path.join(root, outputFile),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), pins }, null, 2)}\n`,
    { mode: 0o600 },
  );
  process.stdout.write(`Published ${Object.keys(pins).length} immutable onboarding templates.\n`);
  process.stdout.write(`Pins written to ${outputFile}.\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function createStaffSession() {
  const launch = await appRequest<{ launchUrl: string }>("/v1/integration-sessions", {
    method: "POST",
    body: JSON.stringify({
      actor: {
        subject: "homix-contract-release",
        email: "sunnyz@homixny.com",
        displayName: "Si Zhang",
        role: "preparer",
      },
      intent: { kind: "dashboard" },
      returnUrl,
    }),
  });
  const launchUrl = new URL(launch.launchUrl);
  const ticket =
    new URLSearchParams(launchUrl.hash.slice(1)).get("ticket") ||
    launchUrl.searchParams.get("ticket");
  if (!ticket) throw new Error("eSign did not return an integration ticket.");
  const response = await fetch(`${baseUrl}/v1/integration-sessions/exchange`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ ticket }),
  });
  const body = await parseResponse<{ csrfToken: string }>(response);
  const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(";", 1)[0]).join("; ");
  if (!cookies) throw new Error("eSign did not establish a delegated staff session.");
  return { cookie: cookies, csrf: body.csrfToken };
}

async function createTemplate(
  contract: ReleaseContract,
  bytes: Buffer,
  session: { cookie: string; csrf: string },
) {
  const form = new FormData();
  form.set(
    "metadata",
    JSON.stringify({
      name: `${contract.entity} ${contract.agreement === "team_leader" ? "Team Leader Agreement" : "Agent Affiliation Agreement"}`,
      sourceName: contract.file,
      licenseOwner: contract.entity,
      edition: contract.file.match(/_v([0-9.]+)-/)?.[1] || "approved",
      effectiveDate: "2026-08-26",
      jurisdiction: "NY",
      businessDomain: "HR",
      approvalRequired: false,
      retentionPolicyId: "hr-onboarding-7y",
    }),
  );
  const pdfArrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  form.set("file", new Blob([pdfArrayBuffer], { type: "application/pdf" }), contract.file);
  return staffRequest<Template>("/v1/templates", session, { method: "POST", body: form });
}

async function appRequest<T>(pathname: string, init: RequestInit) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-esign-key": applicationKey,
      ...init.headers,
    },
  });
  return parseResponse<T>(response);
}

async function staffRequest<T>(
  pathname: string,
  session: { cookie: string; csrf: string },
  init: RequestInit,
) {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("cookie", session.cookie);
  headers.set("x-csrf-token", session.csrf);
  if (!(init.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers });
  return parseResponse<T>(response);
}

async function parseResponse<T>(response: Response) {
  const body = (await response.json().catch(() => null)) as
    | ApiResult<T>
    | { error?: { message?: string; details?: unknown } }
    | null;
  if (!response.ok || !body || !("data" in body)) {
    const detail = body && "error" in body ? JSON.stringify(body.error) : response.statusText;
    throw new Error(`eSign request failed (${response.status}): ${detail}`);
  }
  return body.data;
}

function buildFields(
  contract: ReleaseContract,
  documentId: string,
  signerId: string,
  countersignerId: string,
) {
  const stable = contract.agreement === "team_leader"
    ? manifest.team_leader_common
    : [
        ...manifest.agent_common,
        ...(contract.entity === "Homix Realty Inc." ? manifest.realty_agent_appendix : []),
      ];
  const perPage = new Map<number, number>();
  const fields: TemplateFieldPayload[] = stable.map((field) => {
    const index = perPage.get(field.page) || 0;
    perPage.set(field.page, index + 1);
    return {
      id: randomUUID(),
      fieldKey: field.fieldKey,
      documentId,
      page: field.page,
      type: eSignFieldType(field),
      roleId: field.role === "signer" ? signerId : field.role === "countersigner" ? countersignerId : null,
      label: labelFor(field.fieldKey),
      required: true,
      readOnly: field.readOnly ?? false,
      sensitive: field.fieldKey === "realty.libor_date_of_birth",
      tabIndex: fieldsTabIndex(field.page, index),
      rect: rectFor(field.fieldKey, field.type, field.page, index),
      ...(field.mergeKey ? { mergeKey: field.mergeKey } : {}),
    };
  });
  const mergeKeys = contract.agreement === "team_leader"
    ? [
        "agent_id", "agent_name", "agent_email", "agent_phone", "license_number",
        "licensed_company", "compensation_plan", "team_name", "expected_member_count",
        "team_positioning", "team_split_pct", "team_sourced_split_pct", "team_cap_usd",
        "team_terms_effective_from",
      ]
    : [
        "agent_id", "agent_name", "agent_email", "agent_phone", "license_number",
        "licensed_company", "compensation_plan", "split_pct", "sponsor_name",
        "affiliation_term_months", "team_name", "team_split_pct",
        "team_sourced_split_pct", "team_cap_usd", "team_terms_effective_from",
      ];
  const existingMergeKeys = new Set(stable.flatMap((field) => field.mergeKey ? [field.mergeKey] : []));
  for (const [index, mergeKey] of mergeKeys.entries()) {
    if (existingMergeKeys.has(mergeKey)) continue;
    fields.push({
      id: randomUUID(),
      documentId,
      page: contract.agreement === "team_leader" ? (index < 7 ? 1 : 2) : (index < 7 ? 1 : 2),
      type: "merge",
      roleId: null,
      label: labelFor(mergeKey),
      required: true,
      readOnly: true,
      sensitive: false,
      tabIndex: 900 + index,
      rect: mergeRect(index),
      mergeKey,
    });
  }
  return fields;
}

function labelFor(value: string) {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function eSignFieldType(field: ManifestField) {
  if (field.type !== "date") return field.type;
  return field.fieldKey === "realty.libor_date_of_birth" ? "text" : "signed_date";
}

function fieldsTabIndex(page: number, index: number) {
  return page * 100 + index;
}

function mergeRect(index: number): Rect {
  const local = index % 7;
  return {
    x: index < 7 ? 0.12 : 0.54,
    y: 0.55 + local * 0.045,
    width: 0.34,
    height: 0.026,
    rotation: 0,
  };
}

function rectFor(fieldKey: string, type: string, page: number, index: number): Rect {
  const explicit: Record<string, Rect> = {
    "agent.plan_acknowledgement": rect(0.10, 0.55, 0.03, 0.025),
    "agent.plan_signature": rect(0.10, 0.62, 0.31, 0.04),
    "agent.plan_signed_date": rect(0.39, 0.62, 0.14, 0.035),
    "company.plan_countersignature": rect(0.56, 0.62, 0.27, 0.04),
    "company.plan_countersigned_date": rect(0.82, 0.62, 0.13, 0.035),
    "agent.compensation_plan": rect(0.37, 0.18, 0.24, 0.028),
    "agent.reporting_acknowledgement": rect(0.10, 0.17, 0.03, 0.025),
    "agent.reporting_signature": rect(0.10, 0.24, 0.31, 0.04),
    "agent.reporting_signed_date": rect(0.39, 0.24, 0.14, 0.035),
    "company.reporting_countersignature": rect(0.56, 0.24, 0.27, 0.04),
    "company.reporting_countersigned_date": rect(0.82, 0.24, 0.13, 0.035),
    "agent.ica_address": rect(0.18, 0.13, 0.52, 0.03),
    "agent.ica_effective_date": rect(0.70, 0.13, 0.19, 0.03),
    "agent.ica_signature": rect(0.10, 0.48, 0.31, 0.04),
    "agent.ica_signed_date": rect(0.39, 0.48, 0.14, 0.035),
    "company.ica_countersignature": rect(0.56, 0.48, 0.27, 0.04),
    "company.ica_countersigned_date": rect(0.82, 0.48, 0.13, 0.035),
    "agent.nda_signature": rect(0.10, 0.56, 0.31, 0.04),
    "agent.nda_signed_date": rect(0.39, 0.56, 0.14, 0.035),
    "company.nda_countersignature": rect(0.56, 0.56, 0.27, 0.04),
    "company.nda_countersigned_date": rect(0.82, 0.56, 0.13, 0.035),
    "realty.libor_application_signature": rect(0.12, 0.88, 0.48, 0.035),
    "realty.libor_application_signed_date": rect(0.70, 0.88, 0.18, 0.03),
    "realty.fees_acknowledgement": rect(0.10, 0.51, 0.03, 0.025),
    "realty.fees_initials": rect(0.15, 0.51, 0.12, 0.03),
    "realty.fees_signature": rect(0.10, 0.59, 0.31, 0.04),
    "realty.fees_signed_date": rect(0.39, 0.59, 0.14, 0.035),
    "company.realty_fees_countersignature": rect(0.56, 0.59, 0.27, 0.04),
    "company.realty_fees_countersigned_date": rect(0.82, 0.59, 0.13, 0.035),
    "team.config_acknowledgement": rect(0.10, 0.53, 0.03, 0.025),
    "team.config_initials": rect(0.15, 0.53, 0.12, 0.03),
    "team.compensation_plan": rect(0.39, 0.18, 0.22, 0.028),
    "team.execution_acknowledgement": rect(0.10, 0.20, 0.03, 0.025),
    "team.leader_signature": rect(0.10, 0.29, 0.31, 0.04),
    "team.leader_signed_date": rect(0.39, 0.29, 0.14, 0.035),
    "company.team_leader_countersignature": rect(0.56, 0.29, 0.27, 0.04),
    "company.team_leader_countersigned_date": rect(0.82, 0.29, 0.13, 0.035),
  };
  if (explicit[fieldKey]) return explicit[fieldKey];
  if (page === 19) {
    const column = index % 2;
    const row = Math.floor(index / 2);
    return rect(0.12 + column * 0.45, 0.36 + row * 0.035, type === "date" ? 0.22 : 0.35, 0.024);
  }
  return rect(0.12, Math.min(0.90, 0.20 + index * 0.04), type === "checkbox" ? 0.03 : 0.35, 0.028);
}

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height, rotation: 0 };
}
