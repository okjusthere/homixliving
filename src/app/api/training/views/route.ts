import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, trainingVideoViews } from "@/db/schema";
import { requireAdminApi } from "@/lib/auth-guards";
import { summarizeTrainingVideoViews } from "@/lib/training-views";

export async function GET() {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const rows = await db
    .select({
      view: trainingVideoViews,
      agentName: agents.name,
    })
    .from(trainingVideoViews)
    .leftJoin(agents, eq(trainingVideoViews.agentId, agents.id))
    .orderBy(desc(trainingVideoViews.lastViewedAt));

  const summaries = summarizeTrainingVideoViews(
    rows.map((row) => ({
      videoId: row.view.videoId,
      agentId: row.view.agentId,
      agentEmail: row.view.agentEmail,
      agentName: row.agentName,
      firstViewedAt: row.view.firstViewedAt,
      lastViewedAt: row.view.lastViewedAt,
      openCount: row.view.openCount,
    }))
  );

  return NextResponse.json(summaries);
}
