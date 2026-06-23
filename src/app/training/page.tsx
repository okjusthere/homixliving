import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { trainingVideos, type TrainingVideo } from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { tone } from "@/components/homix/tokens";
import { Card } from "@/components/homix/server-primitives";
import { TrainingManager } from "@/components/training/training-manager";
import { TrainingLibrary } from "@/components/training/training-library";
import { cloudflareStreamConfigured } from "@/lib/cloudflare-stream";
import { TRAINING_CATEGORIES } from "@/lib/training-categories";

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
    <div>
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: tone.ink50 }}>
          Agent training
        </div>
        <h1 className="font-serif mt-1" style={{ fontSize: 34, letterSpacing: "-0.02em", color: tone.ink }}>
          Training videos
        </h1>
        <p className="mt-2 text-[14px]" style={{ color: tone.ink50 }}>
          Internal to Homix — please don&rsquo;t share or record these.
        </p>
      </div>

      {isAdmin && (
        <TrainingManager initialVideos={all} cloudflareConfigured={cloudflareStreamConfigured} />
      )}

      {visible.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-[14px]" style={{ color: tone.ink50 }}>
            {isAdmin
              ? "No videos yet — add one above."
              : "Training videos are being added. Check back soon."}
          </p>
        </Card>
      ) : (
        <TrainingLibrary groups={groups} watermark={watermark} />
      )}

      <p
        className="mt-12 pt-6 text-[11px] uppercase tracking-[0.14em]"
        style={{ color: tone.ink30, borderTop: `1px solid ${tone.lineSoft}` }}
      >
        Homix confidential · do not share
      </p>
    </div>
  );
}
