import type { LicensedCompanyId } from "@/db/schema";

/** Shared administrator settings, reusable beyond signing. Values live in portal.settings. */
export const COMPANY_LICENSE_KEYS = [
  "homix_realty_broker_license",
  "homix_living_broker_license",
] as const;

export function companyLicenseKey(company: LicensedCompanyId) {
  return `${company}_broker_license` as (typeof COMPANY_LICENSE_KEYS)[number];
}

export function validCompanyLicenseSettings(values: Record<string, unknown>) {
  return COMPANY_LICENSE_KEYS.every(
    (key) =>
      values[key] === undefined ||
      (typeof values[key] === "string" && /^\d{11}$/.test(values[key].trim())),
  );
}
