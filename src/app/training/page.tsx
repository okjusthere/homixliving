import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { trainingVideos, type TrainingVideo } from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { tone } from "@/components/homix/tokens";
import { Card, Pill } from "@/components/homix/server-primitives";
import { Watermark } from "@/components/training/watermark";
import { TrainingManager } from "@/components/training/training-manager";
import { streamIframeUrl, cloudflareStreamConfigured } from "@/lib/cloudflare-stream";

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
  const groups = groupByCategory(visible);

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
        <div className="space-y-12">
          {groups.map(([category, items]) => (
            <section key={category}>
              <h2 className="font-serif mb-4" style={{ fontSize: 20, color: tone.ink }}>
                {category}
              </h2>
              <div className="grid gap-6 lg:grid-cols-2">
                {items.map((v) => {
                  const src = streamIframeUrl(v.cloudflareUid);
                  return (
                    <Card key={v.id} className="overflow-hidden">
                      <div className="relative aspect-video" style={{ background: tone.ink }}>
                        {src ? (
                          <iframe
                            src={src}
                            title={v.title}
                            loading="lazy"
                            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                            allowFullScreen
                            className="absolute inset-0 h-full w-full border-0"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span
                              className="text-[11px] uppercase tracking-[0.14em]"
                              style={{ color: "rgba(255,255,255,0.6)" }}
                            >
                              Connecting
                            </span>
                          </div>
                        )}
                        <Watermark label={watermark} />
                      </div>
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-serif" style={{ fontSize: 17, color: tone.ink }}>
                            {v.title}
                          </h3>
                          {!v.isPublished && <Pill tone="draft">Hidden</Pill>}
                        </div>
                        {v.durationLabel && (
                          <div className="mt-1 text-[12px]" style={{ color: tone.ink50 }}>
                            {v.durationLabel}
                          </div>
                        )}
                        {v.description && (
                          <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: tone.ink70 }}>
                            {v.description}
                          </p>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
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
