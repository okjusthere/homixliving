export const COMPANY_W9_DOCUMENTS_SETTING_KEY = "company_w9_documents_v1";
export const HOMIX_LIVING_W9_ID = "homix-living-inc";
export const HOMIX_LIVING_COMPANY_NAME = "Homix Living Inc.";
export const HOMIX_LIVING_W9_FILE_NAME = "Homix Living Inc W9.pdf";
export const MAX_COMPANY_W9_DOCUMENTS = 20;

const DOCUMENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const COMPANY_DOCUMENT_PREFIX = "company-docs/";

export type StoredCompanyW9Document = {
  id: string;
  companyName: string;
  objectKey: string | null;
  fileName: string;
  uploadedAt: string | null;
};

export type CompanyW9DocumentMetadata = Omit<
  StoredCompanyW9Document,
  "objectKey"
> & {
  source: "bundled" | "uploaded";
  isRentalInvoiceDefault: boolean;
};

export type LegacyCompanyW9Metadata = {
  objectKey: string | null;
  fileName: string | null;
  uploadedAt: string | null;
};

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength) return null;
  return cleaned;
}

function normalizeDocument(value: unknown): StoredCompanyW9Document | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = cleanText(candidate.id, 80);
  const companyName = cleanText(candidate.companyName, 120);
  const fileName = cleanText(candidate.fileName, 200);
  if (
    !id ||
    !DOCUMENT_ID_PATTERN.test(id) ||
    !companyName ||
    !fileName
  ) {
    return null;
  }

  const rawObjectKey = cleanText(candidate.objectKey, 500);
  const objectKey =
    rawObjectKey?.startsWith(COMPANY_DOCUMENT_PREFIX) ? rawObjectKey : null;
  const uploadedAt = cleanText(candidate.uploadedAt, 64);

  return {
    id,
    companyName:
      id === HOMIX_LIVING_W9_ID
        ? HOMIX_LIVING_COMPANY_NAME
        : companyName,
    objectKey,
    fileName,
    uploadedAt: objectKey ? uploadedAt : null,
  };
}

export function parseStoredCompanyW9Documents(
  value: string | null | undefined,
): StoredCompanyW9Document[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const documents: StoredCompanyW9Document[] = [];
    for (const item of parsed) {
      const document = normalizeDocument(item);
      if (!document || seen.has(document.id)) continue;
      seen.add(document.id);
      documents.push(document);
      if (documents.length >= MAX_COMPANY_W9_DOCUMENTS) break;
    }
    return documents;
  } catch {
    return [];
  }
}

export function ensureHomixLivingW9(
  documents: StoredCompanyW9Document[],
  legacy: LegacyCompanyW9Metadata,
): StoredCompanyW9Document[] {
  const existing = documents.find(
    (document) => document.id === HOMIX_LIVING_W9_ID,
  );
  const defaultDocument: StoredCompanyW9Document = existing
    ? {
        ...existing,
        companyName: HOMIX_LIVING_COMPANY_NAME,
      }
    : {
        id: HOMIX_LIVING_W9_ID,
        companyName: HOMIX_LIVING_COMPANY_NAME,
        objectKey: legacy.objectKey,
        fileName: legacy.fileName || HOMIX_LIVING_W9_FILE_NAME,
        uploadedAt: legacy.objectKey ? legacy.uploadedAt : null,
      };

  return [
    defaultDocument,
    ...documents.filter(
      (document) => document.id !== HOMIX_LIVING_W9_ID,
    ),
  ].slice(0, MAX_COMPANY_W9_DOCUMENTS);
}

export function toCompanyW9DocumentMetadata(
  document: StoredCompanyW9Document,
): CompanyW9DocumentMetadata {
  return {
    id: document.id,
    companyName: document.companyName,
    fileName: document.fileName,
    uploadedAt: document.uploadedAt,
    source: document.objectKey ? "uploaded" : "bundled",
    isRentalInvoiceDefault: document.id === HOMIX_LIVING_W9_ID,
  };
}

export function isCompanyW9DocumentId(value: string): boolean {
  return DOCUMENT_ID_PATTERN.test(value);
}

export function cleanCompanyName(value: unknown): string | null {
  return cleanText(value, 120);
}
