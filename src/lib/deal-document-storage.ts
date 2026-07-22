import { randomUUID } from "node:crypto";
import type { DealType } from "@/lib/deal-access";

export const MAX_DEAL_DOCUMENT_BYTES = 25 * 1024 * 1024;

const CONTENT_TYPE_EXTENSIONS: Record<string, ReadonlySet<string>> = {
  "application/pdf": new Set([".pdf"]),
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/png": new Set([".png"]),
  "image/webp": new Set([".webp"]),
  "image/heic": new Set([".heic"]),
  "image/heif": new Set([".heif"]),
  "application/msword": new Set([".doc"]),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": new Set([
    ".docx",
  ]),
  "application/vnd.ms-excel": new Set([".xls"]),
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": new Set([
    ".xlsx",
  ]),
  "text/plain": new Set([".txt"]),
};

export type DealDocumentMetadata = {
  fileName: string;
  contentType: string;
  size: number;
};

export type DealDocumentValidation =
  | { ok: true; value: DealDocumentMetadata }
  | { ok: false; error: string };

function fileExtension(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

export function validateDealDocumentMetadata(input: {
  fileName: unknown;
  contentType: unknown;
  size: unknown;
}): DealDocumentValidation {
  const fileName = typeof input.fileName === "string" ? input.fileName.trim() : "";
  const contentType =
    typeof input.contentType === "string"
      ? input.contentType.split(";", 1)[0].trim().toLowerCase()
      : "";
  const size = Number(input.size);

  if (!fileName || fileName.length > 300 || /[\\/\u0000-\u001f\u007f]/.test(fileName)) {
    return { ok: false, error: "A valid file name is required" };
  }
  if (!Number.isInteger(size) || size <= 0 || size > MAX_DEAL_DOCUMENT_BYTES) {
    return { ok: false, error: "File must be between 1 byte and 25 MB" };
  }

  const allowedExtensions = CONTENT_TYPE_EXTENSIONS[contentType];
  if (!allowedExtensions || !allowedExtensions.has(fileExtension(fileName))) {
    return { ok: false, error: "File type and extension are not allowed" };
  }

  return { ok: true, value: { fileName, contentType, size } };
}

function safeObjectFileName(fileName: string) {
  const extension = fileExtension(fileName);
  const stem = fileName.slice(0, fileName.length - extension.length);
  const safeStem = stem
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._() -]+/gu, "-")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 160);
  return `${safeStem || "document"}${extension}`;
}

export function dealDocumentPrefix(dealType: DealType, dealId: number) {
  return `deal-docs/${dealType}/${dealId}/`;
}

export function buildDealDocumentKey(
  dealType: DealType,
  dealId: number,
  fileName: string,
  nonce = randomUUID()
) {
  return `${dealDocumentPrefix(dealType, dealId)}${nonce}-${safeObjectFileName(fileName)}`;
}

export function isDealDocumentKeyForDeal(
  objectKey: string,
  dealType: DealType,
  dealId: number
) {
  const prefix = dealDocumentPrefix(dealType, dealId);
  if (!objectKey.startsWith(prefix) || objectKey.length > 512) return false;
  const suffix = objectKey.slice(prefix.length);
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-.+$/i.test(
      suffix
    ) &&
    !suffix.includes("/") &&
    !suffix.includes("\\")
  );
}
