import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { trainingVideos, type TrainingVideo } from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { tone } from "@/components/homix/tokens";
import { Card } from "@/components/homix/server-primitives";
import { PageHeader } from "@/components/homix/page-kit";
import { TrainingManager } from "@/components/training/training-manager";
import { TrainingLibrary } from "@/components/training/training-library";
import { cloudflareStreamConfigured } from "@/lib/cloudflare-stream";
import { TRAINING_CATEGORIES } from "@/lib/training-categories";
import { getLocale } from "@/lib/i18n";

const M = {
  en: {
    eyebrow: "Agent training",
    title: "Training videos",
    description: "Internal to Homix — please do not share or record these.",
    emptyAdmin: "No videos yet — add one above.",
    emptyAgent: "Training videos are being added. Check back soon.",
    confidential: "Homix confidential · do not share",
  },
  zh: {
    eyebrow: "经纪人培训",
    title: "培训视频",
    description: "Homix 内部资料 — 请勿分享或录制。",
    emptyAdmin: "暂无视频 — 请在上方添加。",
    emptyAgent: "培训视频正在添加中，请稍后再来查看。",
    confidential: "Homix 机密 · 请勿分享",
  },
} as const;

export const metadata: Metadata = { title: "Training · Homix Deals" };

function groupByCategory(items: TrainingVideo[]): [string, TrainingVideo[]][] {
  const map = new Map<string, TrainingVideo[]>();
  for (const it of items) {
    const key = it.category || "General";
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  return Array.from(map.entries());
}

export default async function TrainingPage() {
  const session = await requireActiveAgent();
  const locale = await getLocale();
  const t = M[locale];
  const isAdmin = !!session.user.isAdmin;
  const watermark = session.user.email || "Homix agent";

  const all = await db
    .select()
    .from(trainingVideos)
    .orderBy(asc(trainingVideos.sortOrder), asc(trainingVideos.id));
  const visible = isAdmin ? all : all.filter((v) => v.isPublished);
  const order = (c: string) => {
    const i = TRAINING_CATEGORIES.indexOf(c);
    return i === -1 ? 999 : i;
  };
  const groups = groupByCategory(visible).sort((a, b) => order(a[0]) - order(b[0]));

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
      />

      {isAdmin && (
        <TrainingManager initialVideos={all} cloudflareConfigured={cloudflareStreamConfigured} />
      )}

      {visible.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-[14px]" style={{ color: tone.ink50 }}>
            {isAdmin ? t.emptyAdmin : t.emptyAgent}
          </p>
        </Card>
      ) : (
        <TrainingLibrary groups={groups} watermark={watermark} />
      )}

      <p
        className="mt-12 pt-6 text-[11px] uppercase tracking-[0.14em]"
        style={{ color: tone.ink30, borderTop: `1px solid ${tone.lineSoft}` }}
      >
        {t.confidential}
      </p>
    </div>
  );
}
