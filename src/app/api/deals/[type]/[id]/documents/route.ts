import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { checklistItems, dealDocuments, saleDeals, type DealDocument } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import {
  canEditDealOfType,
  canViewDealOfType,
  parseDealType,
} from "@/lib/deal-access";
import { logAudit } from "@/lib/audit";
import { checklistGroupsForDeal } from "@/lib/checklist-groups";
import {
  isDealDocumentKeyForDeal,
  validateDealDocumentMetadata,
} from "@/lib/deal-document-storage";
import {
  deleteDealDocument,
  headDealDocument,
  R2ConfigurationError,
} from "@/lib/r2-storage";

const documentFields = {
  id: dealDocuments.id,
  dealType: dealDocuments.dealType,
  dealId: dealDocuments.dealId,
  fileName: dealDocuments.fileName,
  contentType: dealDocuments.contentType,
  size: dealDocuments.size,
  uploadedByEmail: dealDocuments.uploadedByEmail,
  checklistItemId: dealDocuments.checklistItemId,
  createdAt: dealDocuments.createdAt,
};

async function parseParams(params: Promise<{ type: string; id: string }>) {
  const { type, id } = await params;
  const dealType = parseDealType(type);
  const dealId = parseInt(id, 10);
  if (!dealType || !Number.isInteger(dealId) || dealId <= 0) return null;
  return { dealType, dealId };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;
  const parsed = await parseParams(params);
  if (!parsed) return NextResponse.json({ error: "Invalid deal" }, { status: 400 });

  if (!(await canViewDealOfType(authResult.session, parsed.dealType, parsed.dealId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const docs = await db
    .select(documentFields)
    .from(dealDocuments)
    .where(
      and(
        eq(dealDocuments.dealType, parsed.dealType),
        eq(dealDocuments.dealId, parsed.dealId)
      )
    )
    .orderBy(desc(dealDocuments.id));
  return NextResponse.json(docs);
}

// Register an uploaded R2 object only after checking the object still matches
// the signed request's deal, size, and content type.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;
  const parsed = await parseParams(params);
  if (!parsed) return NextResponse.json({ error: "Invalid deal" }, { status: 400 });

  if (!(await canEditDealOfType(authResult.session, parsed.dealType, parsed.dealId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const objectKey = typeof body.objectKey === "string" ? body.objectKey : "";
  if (!isDealDocumentKeyForDeal(objectKey, parsed.dealType, parsed.dealId)) {
    return NextResponse.json(
      { error: "Object key does not belong to this deal" },
      { status: 400 }
    );
  }

  const validated = validateDealDocumentMetadata({
    fileName: body.fileName,
    contentType: body.contentType,
    size: body.size,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  // Optional link to the requirement this upload satisfies. The item must be
  // one this deal's checklist actually asks for — a stray id would silently
  // tick a box on some other packet.
  let checklistItemId: number | null = null;
  if (body.checklistItemId != null && body.checklistItemId !== "") {
    const itemId = Number(body.checklistItemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ error: "Invalid checklist item" }, { status: 400 });
    }
    const [item] = await db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.id, itemId))
      .limit(1);
    let representationType: string | null = null;
    if (parsed.dealType === "sale") {
      const [sale] = await db
        .select({ representationType: saleDeals.representationType })
        .from(saleDeals)
        .where(eq(saleDeals.id, parsed.dealId))
        .limit(1);
      representationType = sale?.representationType ?? null;
    }
    const allowedGroups = checklistGroupsForDeal(parsed.dealType, representationType);
    if (!item || !allowedGroups.includes(item.groupKey as (typeof allowedGroups)[number])) {
      return NextResponse.json(
        { error: "Checklist item does not belong to this deal" },
        { status: 400 },
      );
    }
    checklistItemId = itemId;
  }

  const existing = await db
    .select(documentFields)
    .from(dealDocuments)
    .where(eq(dealDocuments.objectKey, objectKey))
    .get();
  if (existing) return NextResponse.json(existing);

  try {
    const uploaded = await headDealDocument(objectKey);
    const uploadedType = uploaded.ContentType?.split(";", 1)[0].toLowerCase();
    if (
      uploaded.ContentLength !== validated.value.size ||
      uploadedType !== validated.value.contentType
    ) {
      await deleteDealDocument(objectKey).catch(() => {});
      return NextResponse.json(
        { error: "Uploaded file metadata does not match the request" },
        { status: 400 }
      );
    }
  } catch (error) {
    if (error instanceof R2ConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("R2 object verification failed", error);
    return NextResponse.json(
      { error: "Uploaded object could not be verified" },
      { status: 502 }
    );
  }

  let created: DealDocument;
  try {
    [created] = await db
      .insert(dealDocuments)
      .values({
        dealType: parsed.dealType,
        dealId: parsed.dealId,
        fileName: validated.value.fileName,
        legacyUrl: objectKey,
        storageProvider: "r2",
        objectKey,
        contentType: validated.value.contentType,
        size: validated.value.size,
        uploadedByEmail: authResult.session.user.email || null,
        checklistItemId,
      })
      .returning();
  } catch (error) {
    await deleteDealDocument(objectKey).catch(() => {});
    console.error("Deal document registration failed", error);
    return NextResponse.json(
      { error: "Could not register uploaded document" },
      { status: 500 }
    );
  }
  await logAudit(
    authResult.session,
    "upload",
    "deal_document",
    created.id,
    `上传成交文件 ${created.fileName} · ${parsed.dealType === "rental" ? "租赁" : "买卖"}成交 #${parsed.dealId}`
  );
  return NextResponse.json(
    {
      id: created.id,
      dealType: created.dealType,
      dealId: created.dealId,
      fileName: created.fileName,
      contentType: created.contentType,
      size: created.size,
      uploadedByEmail: created.uploadedByEmail,
      createdAt: created.createdAt,
    },
    { status: 201 }
  );
}
