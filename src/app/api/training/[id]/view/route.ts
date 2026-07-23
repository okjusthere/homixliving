import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { trainingVideoViews, trainingVideos } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";

function parseId(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const videoId = parseId(id);
  if (!videoId) return NextResponse.json({ error: "Invalid video id" }, { status: 400 });

  const video = await db
    .select()
    .from(trainingVideos)
    .where(eq(trainingVideos.id, videoId))
    .then((rows) => rows[0]);
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });
  if (!video.isPublished && !auth.session.user.isAdmin) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const agentEmail = auth.session.user.email?.trim().toLowerCase();
  if (!agentEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  await db
    .insert(trainingVideoViews)
    .values({
      videoId,
      agentId: auth.session.user.agentId,
      agentEmail,
      firstViewedAt: now,
      lastViewedAt: now,
      openCount: 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [trainingVideoViews.videoId, trainingVideoViews.agentEmail],
      set: {
        agentId: auth.session.user.agentId,
        lastViewedAt: now,
        openCount: sql`${trainingVideoViews.openCount} + 1`,
        updatedAt: now,
      },
    });

  return NextResponse.json({ success: true });
}
