import { resolveLicensedCompany } from "./licensed-companies";
import { companyLicenseKey } from "./company-settings";
import type { SigningPackage } from "./signing-contract";

export type SigningIdentitySource = {
  legalName: string | null;
  email: string;
  licensedCompanyId: string | null;
  licensedCompany: string | null;
  licenseNumber: string | null;
  phone: string | null;
};

export function signingCompanyIdentity(
  agent: SigningIdentitySource,
  companySettings: Record<string, string> = {},
) {
  const company = resolveLicensedCompany(
    agent.licensedCompanyId || agent.licensedCompany,
  );
  return {
    legalName: agent.legalName,
    email: agent.email,
    companyKey: company?.id || null,
    companyName: company?.legalName || "",
    companyAddress: company?.address || "",
    companyMailingLine: company
      ? `${company.legalName}, ${company.address}`
      : "",
    brokerLicense: company
      ? companySettings[companyLicenseKey(company.id)] || ""
      : "",
    agentLicense: agent.licenseNumber || "",
    agentPhone: agent.phone || "",
  };
}
export type SigningCompanyIdentity = ReturnType<typeof signingCompanyIdentity>;

export function signingPackageCompanies(
  item: Pick<SigningPackage, "company_key" | "applicable_company_keys">,
) {
  return item.applicable_company_keys?.length
    ? item.applicable_company_keys
    : [item.company_key];
}

export function bindSigningCompany(
  input: Record<string, unknown>,
  identity: SigningCompanyIdentity,
) {
  const values =
    input.values &&
    typeof input.values === "object" &&
    !Array.isArray(input.values)
      ? (input.values as Record<string, unknown>)
      : {};
  return {
    ...input,
    companyKey: identity.companyKey,
    values: {
      ...values,
      company_name: identity.companyName,
      company_address: identity.companyAddress,
      company_mailing_line: identity.companyMailingLine,
      broker_license: identity.brokerLicense,
      agent_license: identity.agentLicense,
      agent_phone: identity.agentPhone,
      agent_email: identity.email,
    },
  };
}
