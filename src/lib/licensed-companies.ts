import type { LicensedCompanyId } from "@/db/schema";
export type { LiborMembershipStatus } from "@/db/schema";

export type LicensedCompanyDefinition = {
  id: LicensedCompanyId;
  legalName: string;
  address: string;
  brokerName: string;
  brokerTitle: string;
  brokerEmail: string;
  requiresLiborOneKey: boolean;
};

export const LICENSED_COMPANIES: readonly LicensedCompanyDefinition[] = [
  {
    id: "homix_realty",
    legalName: "Homix Realty Inc.",
    address: "37-20 Prince St, STE 3H, Flushing, NY 11354",
    brokerName: "Si Zhang",
    brokerTitle: "Broker",
    brokerEmail: "sunnyz@homixny.com",
    requiresLiborOneKey: true,
  },
  {
    id: "homix_living",
    legalName: "Homix Living Inc.",
    address: "110 Charlton St #A, New York, NY 10014",
    brokerName: "Si Zhang",
    brokerTitle: "Broker",
    brokerEmail: "sunnyz@homixny.com",
    requiresLiborOneKey: false,
  },
] as const;

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function resolveLicensedCompany(value: string | null | undefined) {
  const normalized = normalize(value);
  return LICENSED_COMPANIES.find((company) => (
    normalize(company.id) === normalized || normalize(company.legalName) === normalized
  )) || null;
}

export function requireLicensedCompany(value: string | null | undefined) {
  const company = resolveLicensedCompany(value);
  if (!company) throw new Error("Unsupported licensed company.");
  return company;
}

export function sameLicensedCompany(
  left: LicensedCompanyId | null | undefined,
  right: LicensedCompanyId | null | undefined,
) {
  return Boolean(left && right && left === right);
}

export function companyChangeInvalidatesOnboarding(input: {
  currentCompanyId: LicensedCompanyId | null;
  requestedCompanyId: LicensedCompanyId;
  agreementStatus: string;
}) {
  return Boolean(
    input.currentCompanyId &&
      input.currentCompanyId !== input.requestedCompanyId &&
      input.agreementStatus !== "not_started",
  );
}
