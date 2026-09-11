import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { agents, trainingVideoViews, trainingVideos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guards";
import { getLocale } from "@/lib/i18n";
import { PageHeader } from "@/components/homix/page-kit";
import { TrainingManager } from "@/components/training/training-manager";
import { cloudflareStreamConfigured } from "@/lib/cloudflare-stream";
import { summarizeTrainingVideoViews } from "@/lib/training-views";
export const metadata = { title: "Training management · Homix" };
export default async function Page() {
  await requireAdmin();
  const zh = (await getLocale()) === "zh";
  const all = await db
    .select()
    .from(trainingVideos)
    .orderBy(asc(trainingVideos.sortOrder), asc(trainingVideos.id));
  const viewRows = await db
    .select({
      view: trainingVideoViews,
      agentName: agents.name,
    })
    .from(trainingVideoViews)
    .leftJoin(agents, eq(trainingVideoViews.agentId, agents.id))
    .orderBy(desc(trainingVideoViews.lastViewedAt));
  const viewSummaries = summarizeTrainingVideoViews(
    viewRows.map((row) => ({
      videoId: row.view.videoId,
      agentId: row.view.agentId,
      agentEmail: row.view.agentEmail,
      agentName: row.agentName,
      firstViewedAt: row.view.firstViewedAt,
      lastViewedAt: row.view.lastViewedAt,
      openCount: row.view.openCount,
    })),
  );
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={zh ? "内容与培训" : "Content & learning"}
        title={zh ? "培训管理" : "Training management"}
        description={
          zh
            ? "维护课程、发布状态与学习记录。"
            : "Manage courses, publishing and viewing records."
        }
        actions={
          <Link className="admin-control" href="/training">
            {zh ? "打开学习页 ↗" : "Open learning library ↗"}
          </Link>
        }
      />
      <TrainingManager
        initialVideos={all}
        initialViewSummaries={viewSummaries}
        cloudflareConfigured={cloudflareStreamConfigured}
      />
    </div>
  );
}
