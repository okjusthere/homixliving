import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { dealDocuments } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canEditDealOfType, parseDealType } from "@/lib/deal-access";

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
    .get();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Remove the blob first; if that fails we keep the row so the file stays
  // reachable rather than orphaned-but-invisible.
  try {
    await del(doc.url);
  } catch (error) {
    console.error("Blob delete failed", doc.url, error);
    return NextResponse.json({ error: "Storage deletion failed" }, { status: 500 });
  }
  await db.delete(dealDocuments).where(eq(dealDocuments.id, documentId));
  return NextResponse.json({ success: true });
}
