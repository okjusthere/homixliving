import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentPaymentProfiles } from "@/db/schema";
import { requireAdminApi } from "@/lib/auth-guards";
import {
  R2ConfigurationError,
  createAgentDocumentDownloadUrl,
} from "@/lib/r2-storage";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

// Admin download of an agent's W-9 (60-second signed URL). Access is audited.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const agentId = parseInt(String(id), 10);
  if (!Number.isFinite(agentId)) {
    return NextResponse.json({ error: "Invalid agent id" }, { status: 400 });
  }

  const [profile] = await db
    .select()
    .from(agentPaymentProfiles)
    .where(eq(agentPaymentProfiles.agentId, agentId))
    .limit(1);
  if (!profile?.w9ObjectKey) {
    return NextResponse.json({ error: "No W-9 on file" }, { status: 404 });
  }

  try {
    const url = await createAgentDocumentDownloadUrl(
      profile.w9ObjectKey,
      profile.w9FileName || "w9.pdf",
    );
    await logAudit(auth.session, "download", "agent", agentId, `查看经纪人 #${agentId} W-9`);
    return NextResponse.redirect(url, {
      status: 307,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof R2ConfigurationError) {
      return NextResponse.json({ error: "Document storage is not configured." }, { status: 503 });
    }
    return NextResponse.json({ error: "Download failed" }, { status: 502 });
  }
}
