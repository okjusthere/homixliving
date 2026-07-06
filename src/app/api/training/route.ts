import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { trainingVideos } from "@/db/schema";
import { requireActiveAgentApi, requireAdminApi } from "@/lib/auth-guards";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  const rows = await db
    .select()
    .from(trainingVideos)
    .orderBy(asc(trainingVideos.sortOrder), asc(trainingVideos.id));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const title = String(body.title || "").trim();
  const cloudflareUid = String(body.cloudflareUid || "").trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!cloudflareUid) return NextResponse.json({ error: "Cloudflare UID is required" }, { status: 400 });

  const [row] = await db
    .insert(trainingVideos)
    .values({
      title,
      cloudflareUid,
      category: String(body.category || "").trim() || "General",
      description: String(body.description || "").trim() || null,
      durationLabel: String(body.durationLabel || "").trim() || null,
    })
    .returning();

  await logAudit(auth.session, "create", "training_video", row.id, `新建培训视频 ${row.title}`);

  return NextResponse.json(row);
}
