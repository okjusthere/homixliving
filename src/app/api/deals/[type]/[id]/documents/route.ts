import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { dealDocuments } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import {
  canEditDealOfType,
  canViewDealOfType,
  parseDealType,
} from "@/lib/deal-access";
import { logAudit } from "@/lib/audit";

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
    .select()
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

// Register an uploaded blob as a document row. The URL must point into THIS
// deal's folder in our Vercel Blob store — that binds the row to a blob the
// caller was actually authorized to upload (cross-deal or external URLs are
// rejected).
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
  const url = typeof body.url === "string" ? body.url : "";
  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  if (!url || !fileName) {
    return NextResponse.json({ error: "url and fileName are required" }, { status: 400 });
  }

  let hostOk = false;
  let pathOk = false;
  try {
    const u = new URL(url);
    hostOk =
      u.protocol === "https:" &&
      u.hostname.endsWith(".public.blob.vercel-storage.com");
    pathOk = u.pathname.startsWith(
      `/deal-docs/${parsed.dealType}/${parsed.dealId}/`
    );
  } catch {
    // not a URL
  }
  if (!hostOk || !pathOk) {
    return NextResponse.json(
      { error: "URL is not a blob belonging to this deal" },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(dealDocuments)
    .values({
      dealType: parsed.dealType,
      dealId: parsed.dealId,
      fileName: fileName.slice(0, 300),
      url,
      contentType: typeof body.contentType === "string" ? body.contentType : null,
      size: Number.isFinite(Number(body.size)) ? Number(body.size) : null,
      uploadedByEmail: authResult.session.user.email || null,
    })
    .returning();
  await logAudit(
    authResult.session,
    "upload",
    "deal_document",
    created.id,
    `上传成交文件 ${created.fileName} · ${parsed.dealType === "rental" ? "租赁" : "买卖"}成交 #${parsed.dealId}`
  );
  return NextResponse.json(created, { status: 201 });
}
