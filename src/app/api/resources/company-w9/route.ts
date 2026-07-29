import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireActiveAgentApi, requireAdminApi } from "@/lib/auth-guards";
import {
  getCompanyW9Metadata,
  saveCompanyW9Metadata,
} from "@/lib/company-w9";
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
const COMPANY_W9_FILE_NAME = "Homix Living Inc W9.pdf";

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" &&
    file.name.toLowerCase().endsWith(".pdf")
  );
}

// All active agents may open the current company W-9. The R2 object remains
// private; this endpoint issues a short-lived signed URL after authorization.
export async function GET() {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;

  const metadata = await getCompanyW9Metadata();
  if (metadata.objectKey) {
    try {
      const url = await createCompanyDocumentDownloadUrl(
        metadata.objectKey,
        COMPANY_W9_FILE_NAME,
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

  // Preserve today's behavior until an admin uploads the first R2 version.
  try {
    const pdf = await readFile(
      join(process.cwd(), "src", "assets", "homix-living-inc-w9.pdf"),
    );
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${COMPANY_W9_FILE_NAME}"`,
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

// Admin-only replacement. Company W-9 files are PDFs, capped at 8 MB, and
// uploaded server-side so R2 never needs public write access or browser CORS.
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

  const previous = await getCompanyW9Metadata();
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
  try {
    await saveCompanyW9Metadata({
      objectKey,
      fileName: file.name,
      uploadedAt,
    });
  } catch (error) {
    await deleteCompanyDocument(objectKey).catch(() => {});
    console.error("Company W-9 metadata save failed", error);
    return NextResponse.json({ error: "Upload could not be saved" }, { status: 500 });
  }

  if (previous.objectKey && previous.objectKey !== objectKey) {
    await deleteCompanyDocument(previous.objectKey).catch(() => {});
  }

  await logAudit(
    auth.session,
    "upload",
    "company_w9",
    null,
    `更新 Company W-9（${file.name}）`,
  );
  return NextResponse.json({ success: true, fileName: file.name, uploadedAt });
}
