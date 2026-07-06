import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminApi } from "@/lib/auth-guards";
import { logAudit } from "@/lib/audit";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const parsedId = parseInt(String(id), 10);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "Invalid agent id" }, { status: 400 });
  }

  await db
    .update(agents)
    .set({ isActive: false, approvalStatus: "ignored", updatedAt: new Date().toISOString() })
    .where(eq(agents.id, parsedId));

  await logAudit(authResult.session, "ignore", "agent", parsedId, `忽略经纪人申请 #${parsedId}`);

  return NextResponse.json({ success: true });
}
