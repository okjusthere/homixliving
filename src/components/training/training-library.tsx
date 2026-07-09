"use client";

import { useState } from "react";
import { tone } from "@/components/homix/tokens";
import { streamIframeUrl, streamThumbnailUrl } from "@/lib/cloudflare-stream";
import { useLocale } from "@/lib/i18n-client";
import { Watermark } from "./watermark";
import type { TrainingVideo } from "@/db/schema";

const M = {
  en: {
    hidden: "hidden",
    videoCount: (n: number) => `${n} videos`,
    collapse: "Collapse",
    expandAll: (n: number) => `Show all ${n} videos`,
    close: "Close",
  },
  zh: {
    hidden: "隐藏",
    videoCount: (n: number) => `${n} 个视频`,
    collapse: "收起",
    expandAll: (n: number) => `展开全部 ${n} 个视频`,
    close: "关闭",
  },
} as const;

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden
      style={{ transition: "transform .2s", transform: open ? "rotate(180deg)" : "none", color: tone.ink50 }}
    >
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A "designed" video cover: poster frame + dark gradient + glassy play button +
 *  title overlaid. The gradient unifies the look so an awkward auto-frame still
 *  reads as an intentional, branded thumbnail. */
function VideoCover({ video, onPlay }: { video: TrainingVideo; onPlay: () => void }) {
  const t = M[useLocale()];
  const thumb = streamThumbnailUrl(video.cloudflareUid);
  return (
    <button type="button" onClick={onPlay} className="group block w-full text-left">
      <div className="relative aspect-video overflow-hidden rounded-lg" style={{ background: tone.ink }}>
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(20,18,16,0.92) 0%, rgba(20,18,16,0.32) 40%, rgba(20,18,16,0.10) 72%, rgba(20,18,16,0.20) 100%)",
          }}
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span
            className="flex items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110"
            style={{
              width: 46,
              height: 46,
              background: "rgba(255,255,255,0.18)",
              border: "1px solid rgba(255,255,255,0.55)",
              backdropFilter: "blur(2px)",
            }}
          >
            <span
              style={{
                marginLeft: 3,
                width: 0,
                height: 0,
                borderTop: "7px solid transparent",
                borderBottom: "7px solid transparent",
                borderLeft: "11px solid #fff",
              }}
            />
          </span>
        </span>
        {video.durationLabel && (
          <span
            className="absolute top-2 right-2 rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
          >
            {video.durationLabel}
          </span>
        )}
        {!video.isPublished && (
          <span
            className="absolute top-2 left-2 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
            style={{ background: tone.amber, color: "#fff" }}
          >
            {t.hidden}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div
            className="font-serif leading-snug line-clamp-2"
            style={{ fontSize: 14, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}
          >
            {video.title}
          </div>
        </div>
      </div>
    </button>
  );
}

/** How many videos make up one row at the widest grid (xl:grid-cols-4). */
const ROW = 4;

function recordVideoOpen(videoId: number) {
  void fetch(`/api/training/${videoId}/view`, {
    method: "POST",
    keepalive: true,
  }).catch(() => undefined);
}

export function TrainingLibrary({
  groups,
  watermark,
}: {
  groups: [string, TrainingVideo[]][];
  watermark: string;
}) {
  const t = M[useLocale()];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<TrainingVideo | null>(null);

  return (
    <div className="space-y-5">
      {groups.map(([category, items]) => {
        const isExpanded = expanded[category] ?? false;
        const shown = isExpanded ? items : items.slice(0, ROW);
        const hasMore = items.length > ROW;
        return (
          <section
            key={category}
            className="rounded-xl overflow-hidden"
            style={{ border: `1px solid ${tone.line}`, background: tone.card }}
          >
            <div
              className="flex items-baseline justify-between px-5 py-4"
              style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
            >
              <div className="flex items-baseline gap-3">
                <span className="font-serif" style={{ fontSize: 18, color: tone.ink }}>
                  {category}
                </span>
                <span className="text-[12px]" style={{ color: tone.ink50 }}>
                  {t.videoCount(items.length)}
                </span>
              </div>
            </div>

            <div className="grid gap-4 px-5 pt-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((v) => (
                <VideoCover
                  key={v.id}
                  video={v}
                  onPlay={() => {
                    recordVideoOpen(v.id);
                    setActive(v);
                  }}
                />
              ))}
            </div>

            {hasMore ? (
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [category]: !isExpanded }))}
                className="mt-4 flex w-full items-center justify-center gap-1.5 px-5 py-3 text-[13px] font-medium transition-colors hover:bg-[#FAF7F0]"
                style={{ color: tone.accent, borderTop: `1px solid ${tone.lineSoft}` }}
              >
                {isExpanded ? t.collapse : t.expandAll(items.length)}
                <Chevron open={isExpanded} />
              </button>
            ) : (
              <div className="pb-5" />
            )}
          </section>
        );
      })}

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(20,18,16,0.88)" }}
          onClick={() => setActive(null)}
        >
          <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="relative aspect-video overflow-hidden rounded-xl" style={{ background: tone.ink }}>
              <iframe
                src={streamIframeUrl(active.cloudflareUid)}
                title={active.title}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
              <Watermark label={watermark} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <div className="font-serif" style={{ fontSize: 16, color: "#fff" }}>
                {active.title}
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="shrink-0 text-[13px]"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                {t.close} ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
