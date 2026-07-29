import "server-only";

import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import {
  COMPANY_W9_DOCUMENTS_SETTING_KEY,
  HOMIX_LIVING_W9_ID,
  ensureHomixLivingW9,
  parseStoredCompanyW9Documents,
  toCompanyW9DocumentMetadata,
  type CompanyW9DocumentMetadata,
  type StoredCompanyW9Document,
} from "@/lib/company-w9-model";

export const COMPANY_W9_SETTING_KEYS = {
  objectKey: "company_w9_object_key",
  fileName: "company_w9_file_name",
  uploadedAt: "company_w9_uploaded_at",
} as const;

export type CompanyW9Metadata = {
  objectKey: string | null;
  fileName: string | null;
  uploadedAt: string | null;
};

async function getCompanyW9State(): Promise<{
  documents: StoredCompanyW9Document[];
  legacy: CompanyW9Metadata;
}> {
  const rows = await db
    .select()
    .from(settings)
    .where(
      inArray(settings.key, [
        COMPANY_W9_DOCUMENTS_SETTING_KEY,
        ...Object.values(COMPANY_W9_SETTING_KEYS),
      ]),
    );
  const values = new Map(rows.map((row) => [row.key, row.value]));

  const legacy = {
    objectKey: values.get(COMPANY_W9_SETTING_KEYS.objectKey)?.trim() || null,
    fileName: values.get(COMPANY_W9_SETTING_KEYS.fileName)?.trim() || null,
    uploadedAt: values.get(COMPANY_W9_SETTING_KEYS.uploadedAt)?.trim() || null,
  };

  return {
    documents: ensureHomixLivingW9(
      parseStoredCompanyW9Documents(
        values.get(COMPANY_W9_DOCUMENTS_SETTING_KEY),
      ),
      legacy,
    ),
    legacy,
  };
}

export async function getCompanyW9Documents(): Promise<
  StoredCompanyW9Document[]
> {
  return (await getCompanyW9State()).documents;
}

export async function getCompanyW9Document(
  id: string,
): Promise<StoredCompanyW9Document | null> {
  const documents = await getCompanyW9Documents();
  return documents.find((document) => document.id === id) ?? null;
}

export async function getCompanyW9DocumentMetadata(): Promise<
  CompanyW9DocumentMetadata[]
> {
  return (await getCompanyW9Documents()).map(toCompanyW9DocumentMetadata);
}

export async function getCompanyW9Metadata(): Promise<CompanyW9Metadata> {
  const document = await getCompanyW9Document(HOMIX_LIVING_W9_ID);
  return {
    objectKey: document?.objectKey ?? null,
    fileName: document?.fileName ?? null,
    uploadedAt: document?.uploadedAt ?? null,
  };
}

export async function saveCompanyW9Documents(
  documents: StoredCompanyW9Document[],
): Promise<void> {
  const normalized = ensureHomixLivingW9(documents, {
    objectKey: null,
    fileName: null,
    uploadedAt: null,
  });
  const defaultDocument = normalized[0];
  const entries: [string, string][] = [
    [COMPANY_W9_DOCUMENTS_SETTING_KEY, JSON.stringify(normalized)],
  ];

  // Keep the legacy keys current so a rollback to the previous deployment
  // continues to serve the Rental invoice W-9.
  if (defaultDocument.objectKey) {
    entries.push(
      [COMPANY_W9_SETTING_KEYS.objectKey, defaultDocument.objectKey],
      [COMPANY_W9_SETTING_KEYS.fileName, defaultDocument.fileName],
      [
        COMPANY_W9_SETTING_KEYS.uploadedAt,
        defaultDocument.uploadedAt || new Date().toISOString(),
      ],
    );
  }

  await db.transaction(async (tx) => {
    for (const [key, value] of entries) {
      await tx
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value },
        });
    }
  });
}

export async function saveCompanyW9Metadata(
  metadata: {
    objectKey: string;
    fileName: string;
    uploadedAt: string;
  },
): Promise<void> {
  const documents = await getCompanyW9Documents();
  await saveCompanyW9Documents(
    documents.map((document) =>
      document.id === HOMIX_LIVING_W9_ID
        ? { ...document, ...metadata }
        : document,
    ),
  );
}
