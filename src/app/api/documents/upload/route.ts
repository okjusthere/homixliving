import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canEditDealOfType, parseDealType } from "@/lib/deal-access";

export const runtime = "nodejs";

const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

// Token endpoint for direct browser→Blob uploads (bypasses the 4.5MB
// serverless body limit). The pathname is pinned to the deal the caller can
// edit, so a token can't be reused to write elsewhere in the store.
//
// Two Vercel Blob connection modes exist: the classic static
// BLOB_READ_WRITE_TOKEN, and the newer OIDC mode where the store connection
// injects BLOB_STORE_ID and the SDK authenticates with the runtime
// VERCEL_OIDC_TOKEN. Either counts as configured.
export async function POST(request: Request) {
  const blobConfigured = Boolean(
    process.env.BLOB_READ_WRITE_TOKEN?.trim() || process.env.BLOB_STORE_ID?.trim()
  );
  if (!blobConfigured) {
    return NextResponse.json(
      { error: "Document storage is not configured (connect a Vercel Blob store)." },
      { status: 503 }
    );
  }

  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;
  const session = authResult.session;

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload: { dealType?: string; dealId?: number } = {};
        try {
          payload = clientPayload ? JSON.parse(clientPayload) : {};
        } catch {
          throw new Error("Invalid client payload");
        }
        const dealType = parseDealType(String(payload.dealType || ""));
        const dealId = Number(payload.dealId);
        if (!dealType || !Number.isInteger(dealId) || dealId <= 0) {
          throw new Error("dealType and dealId are required");
        }
        if (!(await canEditDealOfType(session, dealType, dealId))) {
          throw new Error("Not authorized for this deal");
        }
        const requiredPrefix = `deal-docs/${dealType}/${dealId}/`;
        if (!pathname.startsWith(requiredPrefix)) {
          throw new Error("Upload path does not match the deal");
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: 25 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ dealType, dealId }),
        };
      },
      // Row registration happens via the explicit /documents POST from the
      // client (works on localhost too, where this callback never fires).
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 }
    );
  }
}
