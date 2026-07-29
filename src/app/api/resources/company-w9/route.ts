import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireActiveAgentApi, requireAdminApi } from "@/lib/auth-guards";
import {
  getCompanyW9Document,
  getCompanyW9Documents,
  saveCompanyW9Documents,
} from "@/lib/company-w9";
import {
  HOMIX_LIVING_COMPANY_NAME,
  HOMIX_LIVING_W9_FILE_NAME,
  HOMIX_LIVING_W9_ID,
  MAX_COMPANY_W9_DOCUMENTS,
  cleanCompanyName,
  isCompanyW9DocumentId,
  toCompanyW9DocumentMetadata,
} from "@/lib/company-w9-model";
import {
  R2ConfigurationError,
  companyW9ObjectKey,
  createCompanyDocumentDownloadUrl,
  deleteCompanyDocument,
  putCompanyDocument,
} from "@/lib/r2-storage";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_COMPANY_W9_BYTES = 8 * 1024 * 1024;

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" &&
    file.name.toLowerCase().endsWith(".pdf")
  );
}

function documentIdFromRequest(req: NextRequest): string {
  return req.nextUrl.searchParams.get("id")?.trim() || HOMIX_LIVING_W9_ID;
}

// All active agents may open company W-9s. The R2 objects remain
// private; this endpoint issues a short-lived signed URL after authorization.
export async function GET(req: NextRequest) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;

  const documentId = documentIdFromRequest(req);
  if (!isCompanyW9DocumentId(documentId)) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }

  const document = await getCompanyW9Document(documentId);
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (document.objectKey) {
    try {
      const url = await createCompanyDocumentDownloadUrl(
        document.objectKey,
        document.fileName,
      );
      return NextResponse.redirect(url, {
        status: 307,
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      if (error instanceof R2ConfigurationError) {
        return NextResponse.json(
          { error: "Document storage is not configured." },
          { status: 503 },
        );
      }
      console.error("Company W-9 download failed", error);
      return NextResponse.json({ error: "Download failed" }, { status: 502 });
    }
  }

  if (documentId !== HOMIX_LIVING_W9_ID) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Preserve the bundled Homix Living file until an admin uploads an R2 copy.
  try {
    const pdf = await readFile(
      join(process.cwd(), "src", "assets", "homix-living-inc-w9.pdf"),
    );
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${HOMIX_LIVING_W9_FILE_NAME}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "No company W-9 is available" },
      { status: 404 },
    );
  }
}

// Admin-only add or replacement. Uploads stay server-side so R2 never needs
// public write access or browser CORS.
export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 },
    );
  }

  const requestedId =
    typeof form.get("documentId") === "string"
      ? String(form.get("documentId")).trim()
      : "";
  if (requestedId && !isCompanyW9DocumentId(requestedId)) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }

  const documents = await getCompanyW9Documents();
  const existing = requestedId
    ? documents.find((document) => document.id === requestedId)
    : null;
  if (requestedId && !existing) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  if (!existing && documents.length >= MAX_COMPANY_W9_DOCUMENTS) {
    return NextResponse.json(
      { error: `A maximum of ${MAX_COMPANY_W9_DOCUMENTS} W-9s is allowed` },
      { status: 409 },
    );
  }

  const companyName =
    requestedId === HOMIX_LIVING_W9_ID
      ? HOMIX_LIVING_COMPANY_NAME
      : cleanCompanyName(form.get("companyName"));
  if (!companyName) {
    return NextResponse.json(
      { error: "Legal company name is required" },
      { status: 400 },
    );
  }
  const duplicate = documents.find(
    (document) =>
      document.id !== requestedId &&
      document.companyName.toLocaleLowerCase() ===
        companyName.toLocaleLowerCase(),
  );
  if (duplicate) {
    return NextResponse.json(
      { error: "A W-9 for this company already exists" },
      { status: 409 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }
  if (file.size > MAX_COMPANY_W9_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 8MB)" },
      { status: 400 },
    );
  }
  if (!isPdf(file)) {
    return NextResponse.json(
      { error: "Please upload a PDF file" },
      { status: 400 },
    );
  }

  const body = Buffer.from(await file.arrayBuffer());
  if (body.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return NextResponse.json(
      { error: "The selected file is not a valid PDF" },
      { status: 400 },
    );
  }

  const documentId = requestedId || randomUUID();
  const objectKey = companyW9ObjectKey(file.name);
  try {
    await putCompanyDocument(objectKey, body, "application/pdf");
  } catch (error) {
    if (error instanceof R2ConfigurationError) {
      return NextResponse.json(
        { error: "Document storage is not configured." },
        { status: 503 },
      );
    }
    console.error("Company W-9 upload failed", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }

  const uploadedAt = new Date().toISOString();
  const nextDocument = {
    id: documentId,
    companyName,
    objectKey,
    fileName: file.name,
    uploadedAt,
  };
  const nextDocuments = existing
    ? documents.map((document) =>
        document.id === documentId ? nextDocument : document,
      )
    : [...documents, nextDocument];

  try {
    await saveCompanyW9Documents(nextDocuments);
  } catch (error) {
    await deleteCompanyDocument(objectKey).catch(() => {});
    console.error("Company W-9 metadata save failed", error);
    return NextResponse.json({ error: "Upload could not be saved" }, { status: 500 });
  }

  if (existing?.objectKey && existing.objectKey !== objectKey) {
    await deleteCompanyDocument(existing.objectKey).catch(() => {});
  }

  await logAudit(
    auth.session,
    "upload",
    "company_w9",
    documentId,
    `${existing ? "更新" : "上传"} ${companyName} W-9（${file.name}）`,
  );
  return NextResponse.json({
    success: true,
    documents: nextDocuments.map(toCompanyW9DocumentMetadata),
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const documentId = documentIdFromRequest(req);
  if (!isCompanyW9DocumentId(documentId)) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }
  if (documentId === HOMIX_LIVING_W9_ID) {
    return NextResponse.json(
      { error: "The Rental invoice W-9 cannot be deleted" },
      { status: 400 },
    );
  }

  const documents = await getCompanyW9Documents();
  const existing = documents.find((document) => document.id === documentId);
  if (!existing) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  try {
    await saveCompanyW9Documents(
      documents.filter((document) => document.id !== documentId),
    );
  } catch (error) {
    console.error("Company W-9 metadata delete failed", error);
    return NextResponse.json(
      { error: "Document could not be deleted" },
      { status: 500 },
    );
  }

  if (existing.objectKey) {
    await deleteCompanyDocument(existing.objectKey).catch((error) => {
      console.error("Company W-9 object cleanup failed", error);
    });
  }
  await logAudit(
    auth.session,
    "delete",
    "company_w9",
    documentId,
    `删除 ${existing.companyName} W-9`,
  );
  return NextResponse.json({ success: true });
}
