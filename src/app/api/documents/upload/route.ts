import { NextResponse } from "next/server";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canEditDealOfType, parseDealType } from "@/lib/deal-access";
import {
  buildDealDocumentKey,
  validateDealDocumentMetadata,
} from "@/lib/deal-document-storage";
import {
  createDealDocumentUploadUrl,
  R2ConfigurationError,
} from "@/lib/r2-storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const dealType = parseDealType(String(body.dealType || ""));
  const dealId = Number(body.dealId);
  if (!dealType || !Number.isInteger(dealId) || dealId <= 0) {
    return NextResponse.json(
      { error: "dealType and dealId are required" },
      { status: 400 }
    );
  }
  if (!(await canEditDealOfType(authResult.session, dealType, dealId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const validated = validateDealDocumentMetadata({
    fileName: body.fileName,
    contentType: body.contentType,
    size: body.size,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    const objectKey = buildDealDocumentKey(
      dealType,
      dealId,
      validated.value.fileName
    );
    const uploadUrl = await createDealDocumentUploadUrl(
      objectKey,
      validated.value.contentType
    );
    return NextResponse.json(
      { objectKey, uploadUrl },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof R2ConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("R2 upload URL generation failed", error);
    return NextResponse.json(
      { error: "Could not prepare document upload" },
      { status: 500 }
    );
  }
}
