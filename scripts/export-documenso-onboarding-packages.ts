import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertValidGeometry,
  mergePlacements,
  stableFieldRect,
  type Rect,
} from "./onboarding-esign-geometry";

type Field = {
  fieldKey: string;
  page: number;
  type: string;
  role: "signer" | "countersigner" | null;
  required: boolean;
  readOnly?: boolean;
  mergeKey?: string;
};
type Contract = {
  file: string;
  sha256: string;
  pages: number;
  entity: string;
  agreement: "agent" | "team_leader";
  plan: "solo" | "solo_pro" | "team_member" | null;
};
export type NativeImportField = {
  key: string;
  actor: "owner" | "company";
  mergeKey?: string;
  required: boolean;
  page: number;
  rect: Rect;
  type: string;
  label: string;
};

// One-time conversion of approved field coordinates. This does not render,
// edit, sign or seal a PDF; all later editing belongs to Documenso.
export function onboardingImportFields(
  contract: Contract,
  manifest: Record<string, Field[]>,
  libor: string | null,
): NativeImportField[] {
  const stable =
    contract.agreement === "team_leader"
      ? manifest.team_leader_common
      : [
          ...manifest.agent_common,
          ...(contract.entity === "Homix Realty Inc."
            ? manifest.realty_agent_appendix.filter(
                (f) =>
                  libor === "apply_new" ||
                  !f.fieldKey.startsWith("realty.libor_"),
              )
            : []),
        ];
  const fields = stable.map((field) => ({
    key: field.fieldKey,
    actor:
      field.role === "countersigner"
        ? ("company" as const)
        : ("owner" as const),
    mergeKey: field.mergeKey,
    required: field.required,
    page: field.page,
    rect: stableFieldRect(field.fieldKey),
    type: field.type === "merge" ? "TEXT" : field.type.toUpperCase(),
    label: field.fieldKey.replace(/[._]/g, " "),
  }));
  for (const [index, placement] of mergePlacements(
    contract.agreement,
  ).entries()) {
    if (
      placement.mergeKey === "libor_membership_status" &&
      contract.entity !== "Homix Realty Inc."
    )
      continue;
    fields.push({
      key: `business_${index}`,
      actor: "owner",
      mergeKey: placement.mergeKey,
      required: false,
      page: placement.page,
      rect: placement.rect,
      type: "TEXT",
      label: placement.label,
    });
  }
  assertValidGeometry(
    fields.map((f) => ({
      ...f,
      type: f.mergeKey ? "merge" : f.type.toLowerCase(),
      roleId: f.actor,
      documentId: "approved-pdf",
    })),
  );
  if (fields.some((f) => f.page > contract.pages))
    throw new Error(`Field exceeds approved page count: ${contract.file}`);
  return fields;
}
export function nativeFieldInput(field: NativeImportField) {
  return {
    identifier: 0,
    type: field.type,
    page: field.page,
    positionX: field.rect.x * 100,
    positionY: field.rect.y * 100,
    width: field.rect.width * 100,
    height: field.rect.height * 100,
    fieldMeta: {
      type: field.type.toLowerCase(),
      label: field.label,
      required: field.mergeKey ? false : field.required,
      readOnly: Boolean(field.mergeKey),
      fontSize: 10,
      ...(field.type === "CHECKBOX"
        ? {
            values: [{ id: 1, checked: false, value: "" }],
            validationRule: "Select exactly",
            validationLength: 1,
          }
        : {}),
    },
  };
}
async function main() {
  const version = Number(process.env.DOCUMENSO_PACKAGE_VERSION || "1");
  if (!Number.isSafeInteger(version) || version < 1 || version > 2147483647)
    throw new Error(
      "DOCUMENSO_PACKAGE_VERSION must be a positive database integer",
    );
  const root = process.cwd(),
    target = path.resolve(
      process.env.DOCUMENSO_PACKAGE_EXPORT ||
        "output/pdf/documenso-package-import.local.json",
    );
  const manifest = JSON.parse(
    await readFile(path.join(root, "contracts/field-manifests.yml"), "utf8"),
  );
  const release = JSON.parse(
    await readFile(path.join(root, "output/pdf/release-index.json"), "utf8"),
  ) as { contracts: Contract[] };
  const packages = [];
  for (const contract of release.contracts) {
    if (
      !["Homix Realty Inc.", "Homix Living Inc."].includes(contract.entity) ||
      (contract.agreement === "agent" && !contract.plan)
    )
      throw new Error("Unsupported release contract");
    const filePath = path.join(root, "output/pdf", contract.file),
      bytes = await readFile(filePath);
    if (createHash("sha256").update(bytes).digest("hex") !== contract.sha256)
      throw new Error(`Approved PDF checksum mismatch: ${contract.file}`);
    const companyKey =
      contract.entity === "Homix Realty Inc." ? "homix_realty" : "homix_living";
    for (const libor of contract.agreement === "agent" &&
    companyKey === "homix_realty"
      ? ["apply_new", "existing_member"]
      : [null]) {
      const fields = onboardingImportFields(contract, manifest, libor);
      const packageKey = `${companyKey}_${contract.agreement}_${contract.plan || "leader"}${libor ? `_${libor}` : ""}`;
      packages.push({
        packageKey,
        version,
        title:
          `${contract.entity} · ${contract.agreement === "team_leader" ? "Team Leader" : contract.plan} ${libor ? `· ${libor}` : ""}`.trim(),
        scenario: contract.agreement === "agent" ? "onboarding" : "team_leader",
        companyKey,
        selectors: {
          plan: contract.plan || "solo_pro",
          ...(libor ? { liborMembershipStatus: libor } : {}),
        },
        file: {
          path: path.relative(path.dirname(target), filePath),
          name: contract.file,
          sha256: contract.sha256,
          pages: contract.pages,
        },
        fields: fields.map((field) => ({
          key: field.key,
          actor: field.actor,
          mergeKey: field.mergeKey,
          required: field.required,
          label: field.label,
          native: nativeFieldInput(field),
        })),
      });
    }
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(
    target,
    JSON.stringify(
      {
        format: "homix-documenso-import-v1",
        generatedAt: new Date().toISOString(),
        packages,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(
    `Exported ${packages.length} approved Documenso package definitions to ${target}. No upload or invitations were sent.`,
  );
}
if (process.argv[1]?.endsWith("export-documenso-onboarding-packages.ts"))
  void main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
