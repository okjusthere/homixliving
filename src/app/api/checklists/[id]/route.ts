import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checklistItems } from "@/db/schema";
import { requireAdminApi } from "@/lib/auth-guards";
import { logAudit } from "@/lib/audit";

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
  if (typeof body.label === "string" && body.label.trim()) patch.label = body.label.trim();
  if (typeof body.sortOrder === "number") patch.sortOrder = body.sortOrder;

  await db.update(checklistItems).set(patch).where(eq(checklistItems.id, pid));
  await logAudit(auth.session, "update", "checklist_item", pid, `更新清单项 #${pid}`, patch);
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
  await db.delete(checklistItems).where(eq(checklistItems.id, pid));
  await logAudit(auth.session, "delete", "checklist_item", pid, `删除清单项 #${pid}`);
  return NextResponse.json({ success: true });
}
