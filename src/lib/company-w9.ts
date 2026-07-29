import "server-only";

import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

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

export async function getCompanyW9Metadata(): Promise<CompanyW9Metadata> {
  const rows = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, Object.values(COMPANY_W9_SETTING_KEYS)));
  const values = new Map(rows.map((row) => [row.key, row.value]));

  return {
    objectKey: values.get(COMPANY_W9_SETTING_KEYS.objectKey)?.trim() || null,
    fileName: values.get(COMPANY_W9_SETTING_KEYS.fileName)?.trim() || null,
    uploadedAt: values.get(COMPANY_W9_SETTING_KEYS.uploadedAt)?.trim() || null,
  };
}

export async function saveCompanyW9Metadata(
  metadata: {
    objectKey: string;
    fileName: string;
    uploadedAt: string;
  },
): Promise<void> {
  const entries = [
    [COMPANY_W9_SETTING_KEYS.objectKey, metadata.objectKey],
    [COMPANY_W9_SETTING_KEYS.fileName, metadata.fileName],
    [COMPANY_W9_SETTING_KEYS.uploadedAt, metadata.uploadedAt],
  ] as const;

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
