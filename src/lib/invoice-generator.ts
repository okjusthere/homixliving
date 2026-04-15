import type { Building } from "@/db/schema";

export function generateInvoiceNumber(
  unit: string,
  building: Building,
  year: number
): string {
  if (building.invoiceNumberFormat) {
    return building.invoiceNumberFormat
      .replace("Unit", unit)
      .replace("{year}", String(year));
  }
  const buildingKey = building.name.toUpperCase().replace(/\s+/g, " ");
  return `${unit}-${buildingKey}-${year}`;
}

export function generateFileName(
  unit: string,
  building: Building,
  licensedCompany: string
): string {
  const buildingKey = building.name.replace(/\s+/g, " ");
  return `${unit}-${buildingKey}-Invoice-${licensedCompany}`;
}

export function generateEmailSubject(
  unit: string,
  building: Building,
  licensedCompany: string
): string {
  const buildingKey = building.name.replace(/\s+/g, " ");
  return `${unit}-${buildingKey}-OP Invoice-${licensedCompany}`;
}
