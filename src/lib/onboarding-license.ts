import { z } from "zod";
import type { Agent } from "@/db/schema";

export const RELEASE_LABELS = {
  released: ["已解除（released）", "Released"],
  not_released: ["尚未解除", "Not released yet"],
  unknown: ["不确定", "Not sure"],
  not_applicable: ["不适用", "Not applicable"],
} as const;

export const licenseNumberInput = z.string().trim().min(1, "License number is required").max(80);
export const licenseReleaseInput = z.object({
  status: z.enum(["released", "not_released", "unknown", "not_applicable"]),
  previousCompany: z.string().trim().max(200),
  note: z.string().trim().max(1000),
}).strict().superRefine((value, ctx) => {
  if (value.status === "not_applicable" && !value.note)
    ctx.addIssue({ code: "custom", path: ["note"], message: "Explain why release is not applicable" });
  if (value.status !== "not_applicable" && !value.previousCompany)
    ctx.addIssue({ code: "custom", path: ["previousCompany"], message: "Enter the previous brokerage name" });
});
export type LicenseReleaseInput = z.infer<typeof licenseReleaseInput>;
export type LicenseRelease = LicenseReleaseInput & { licenseNumber: string; declaredAt: string };
export type DosConfirmation = {
  legalName: string;
  licenseNumber: string;
  companyId: string;
  confirmedBy: number;
  confirmedAt: string;
};
export type DosBasis = Partial<Pick<Agent, "legalName" | "licenseNumber" | "licensedCompanyId" | "dosConfirmation">>;

const normalized = (value: string | null | undefined) => value?.trim().replace(/\s+/g, " ").toLowerCase() || "";
// Applicant declarations never prove DOS affiliation. Only an administrator can
// record this snapshot, and identity/company changes invalidate the confirmation.
export function dosConfirmed(agent: DosBasis): boolean {
  const proof = agent.dosConfirmation;
  return Boolean(proof && normalized(agent.legalName) && normalized(agent.licenseNumber) &&
    agent.licensedCompanyId && proof.companyId === agent.licensedCompanyId &&
    normalized(proof.legalName) === normalized(agent.legalName) &&
    normalized(proof.licenseNumber) === normalized(agent.licenseNumber) &&
    Number.isSafeInteger(proof.confirmedBy) && proof.confirmedBy > 0 &&
    Number.isFinite(Date.parse(proof.confirmedAt)));
}

export const DOS_REQUIRED = "Confirm in DOS that this license is affiliated with the selected company before activation";
