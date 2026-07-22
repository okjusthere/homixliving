import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentPaymentProfiles } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import {
  R2ConfigurationError,
  agentW9ObjectKey,
  createAgentDocumentDownloadUrl,
  deleteAgentDocument,
  putAgentDocument,
} from "@/lib/r2-storage";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_W9_BYTES = 8 * 1024 * 1024;
const W9_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

// Upload/replace the agent's own W-9. Server-side pass-through into the
// PRIVATE R2 bucket (agent-docs/ prefix) — the file is never publicly
// reachable; reads go through short-lived signed URLs with authz.
export async function POST(req: NextRequest) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  const agentId = auth.session.user.agentId;
  if (!agentId) return NextResponse.json({ error: "No agent record" }, { status: 400 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }
  if (file.size > MAX_W9_BYTES) {
    return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 400 });
  }
  if (!W9_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Please upload a PDF, JPG, or PNG" }, { status: 400 });
  }

  const objectKey = agentW9ObjectKey(agentId, file.name);
  try {
    await putAgentDocument(objectKey, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (error) {
    if (error instanceof R2ConfigurationError) {
      return NextResponse.json({ error: "Document storage is not configured." }, { status: 503 });
    }
    console.error("W-9 upload failed", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }

  // Replace: remember the previous object and delete it after the row flips.
  const [existing] = await db
    .select()
    .from(agentPaymentProfiles)
    .where(eq(agentPaymentProfiles.agentId, agentId))
    .limit(1);
  const previousKey = existing?.w9ObjectKey;

  const now = new Date().toISOString();
  await db
    .insert(agentPaymentProfiles)
    .values({
      agentId,
      w9ObjectKey: objectKey,
      w9FileName: file.name,
      w9UploadedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: agentPaymentProfiles.agentId,
      set: { w9ObjectKey: objectKey, w9FileName: file.name, w9UploadedAt: now, updatedAt: now },
    });

  if (previousKey && previousKey !== objectKey) {
    await deleteAgentDocument(previousKey).catch(() => {});
  }

  await logAudit(auth.session, "upload", "agent", agentId, `上传 W-9（${file.name}）`);
  return NextResponse.json({ success: true, fileName: file.name, uploadedAt: now });
}

// Download own W-9 via a 60-second signed URL.
export async function GET() {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  const agentId = auth.session.user.agentId;
  if (!agentId) return NextResponse.json({ error: "No agent record" }, { status: 400 });

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
