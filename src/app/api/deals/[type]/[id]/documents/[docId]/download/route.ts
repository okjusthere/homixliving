import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { dealDocuments } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canViewDealOfType, parseDealType } from "@/lib/deal-access";
import {
  createDealDocumentDownloadUrl,
  R2ConfigurationError,
} from "@/lib/r2-storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ type: string; id: string; docId: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const { type, id, docId } = await params;
  const dealType = parseDealType(type);
  const dealId = Number(id);
  const documentId = Number(docId);
  if (
    !dealType ||
    !Number.isInteger(dealId) ||
    dealId <= 0 ||
    !Number.isInteger(documentId) ||
    documentId <= 0
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!(await canViewDealOfType(authResult.session, dealType, dealId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const doc = await db
    .select({
      fileName: dealDocuments.fileName,
      objectKey: dealDocuments.objectKey,
    })
    .from(dealDocuments)
    .where(
      and(
        eq(dealDocuments.id, documentId),
        eq(dealDocuments.dealType, dealType),
        eq(dealDocuments.dealId, dealId)
      )
    )
    .then((rows) => rows[0]);
  if (!doc?.objectKey) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  try {
    const url = await createDealDocumentDownloadUrl(doc.objectKey, doc.fileName);
    return NextResponse.redirect(url, {
      status: 307,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof R2ConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("R2 document download URL generation failed", error);
    return NextResponse.json({ error: "Download unavailable" }, { status: 502 });
  }
}
