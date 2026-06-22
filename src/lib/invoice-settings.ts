export type InvoiceSettingsMap = Record<string, string | null | undefined>;

export const DEFAULT_INVOICE_SETTINGS: Record<string, string> = {
  cc_email: "homix@homixny.com",
  from_email: "invoice@homixny.com",
  company_name: "Homix Living",
  company_address: "5 West 37th Street, Floor 2\nNew York, NY 10018",
  default_year: "2026",
  payable_to: "Homix Living Inc.",
  tax_id: "",
  mail_check_address: "Homix Living Inc.",
  ach_account_name: "Homix Living Inc.",
  ach_bank_name: "",
  ach_routing_number: "021000089",
  ach_account_number: "6883209576",
  wire_account_name: "Homix Living Inc.",
  wire_bank_name: "",
  wire_routing_number: "021000089",
  wire_account_number: "6883209576",
  wire_bank_address: "",
  wire_swift_code: "",
};

function settingValue(settings: InvoiceSettingsMap, key: string) {
  const value = settings[key];
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || DEFAULT_INVOICE_SETTINGS[key] || "";
}

export function withInvoiceSettingDefaults(settings: InvoiceSettingsMap) {
  const merged: Record<string, string> = {};
  for (const key of Object.keys(DEFAULT_INVOICE_SETTINGS)) {
    merged[key] = settingValue(settings, key);
  }
  for (const [key, value] of Object.entries(settings)) {
    if (!(key in merged)) merged[key] = typeof value === "string" ? value : "";
  }
  return merged;
}

export function invoiceSettingsForDocument(settings: InvoiceSettingsMap) {
  const merged = withInvoiceSettingDefaults(settings);
  return {
    companyName: merged.company_name,
    companyAddress: merged.company_address,
    fromEmail: merged.from_email,
    ccEmail: merged.cc_email,
    payableTo: merged.payable_to,
    taxId: merged.tax_id,
    mailCheckAddress: merged.mail_check_address,
    achBankName: merged.ach_bank_name,
    achRoutingNumber: merged.ach_routing_number,
    achAccountNumber: merged.ach_account_number,
    achAccountName: merged.ach_account_name,
    wireAccountName: merged.wire_account_name,
    wireBankName: merged.wire_bank_name,
    wireRoutingNumber: merged.wire_routing_number,
    wireAccountNumber: merged.wire_account_number,
    wireBankAddress: merged.wire_bank_address,
    wireSwiftCode: merged.wire_swift_code,
  };
}
