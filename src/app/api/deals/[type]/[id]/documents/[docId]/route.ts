import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dealDocuments } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canEditDealOfType, parseDealType } from "@/lib/deal-access";
import { logAudit } from "@/lib/audit";
import { deleteDealDocument, R2ConfigurationError } from "@/lib/r2-storage";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string; docId: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const { type, id, docId } = await params;
  const dealType = parseDealType(type);
  const dealId = parseInt(id, 10);
  const documentId = parseInt(docId, 10);
  if (!dealType || !Number.isInteger(dealId) || !Number.isInteger(documentId)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!(await canEditDealOfType(authResult.session, dealType, dealId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const doc = await db
    .select()
    .from(dealDocuments)
    .where(
      and(
        eq(dealDocuments.id, documentId),
        eq(dealDocuments.dealType, dealType),
        eq(dealDocuments.dealId, dealId)
      )
    )
    .then((rows) => rows[0]);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Remove the object first; if that fails we keep the row so the file stays
  // reachable rather than orphaned-but-invisible.
  try {
    if (!doc.objectKey) {
      return NextResponse.json(
        { error: "This document has no R2 object key" },
        { status: 409 }
      );
    }
    await deleteDealDocument(doc.objectKey);
  } catch (error) {
    if (error instanceof R2ConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("R2 document delete failed", doc.objectKey, error);
    return NextResponse.json({ error: "Storage deletion failed" }, { status: 500 });
  }
  await db.delete(dealDocuments).where(eq(dealDocuments.id, documentId));
  await logAudit(
    authResult.session,
    "delete",
    "deal_document",
    documentId,
    `删除成交文件 ${doc.fileName} · ${dealType === "rental" ? "租赁" : "买卖"}成交 #${dealId}`,
    doc
  );
  return NextResponse.json({ success: true });
}
