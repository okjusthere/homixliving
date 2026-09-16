// Synthetic identity only. Never use production data in tests.
export const verifiedDosFixture = {
  legalName: "Synthetic Legal",
  licenseNumber: "SYNTHETIC",
  licensedCompanyId: "homix_realty" as const,
  dosConfirmation: {
    legalName: "Synthetic Legal", licenseNumber: "SYNTHETIC", companyId: "homix_realty",
    confirmedBy: 1, confirmedAt: "2026-09-16T12:00:00.000Z",
  },
};
