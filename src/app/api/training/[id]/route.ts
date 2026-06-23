import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { trainingVideos } from "@/db/schema";
import { requireAdminApi } from "@/lib/auth-guards";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const pid = parseInt(String(id), 10);
  if (!Number.isFinite(pid)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (typeof body.isPublished === "boolean") patch.isPublished = body.isPublished;
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (typeof body.category === "string") patch.category = body.category.trim() || "General";
  if (typeof body.description === "string") patch.description = body.description.trim() || null;
  if (typeof body.durationLabel === "string") patch.durationLabel = body.durationLabel.trim() || null;
  if (typeof body.cloudflareUid === "string" && body.cloudflareUid.trim())
    patch.cloudflareUid = body.cloudflareUid.trim();
  if (typeof body.sortOrder === "number") patch.sortOrder = body.sortOrder;

  await db.update(trainingVideos).set(patch).where(eq(trainingVideos.id, pid));
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const pid = parseInt(String(id), 10);
  if (!Number.isFinite(pid)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await db.delete(trainingVideos).where(eq(trainingVideos.id, pid));
  return NextResponse.json({ success: true });
}
