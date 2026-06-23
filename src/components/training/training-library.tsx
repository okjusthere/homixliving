"use client";

import { useState } from "react";
import { tone } from "@/components/homix/tokens";
import { streamIframeUrl, streamThumbnailUrl } from "@/lib/cloudflare-stream";
import { Watermark } from "./watermark";
import type { TrainingVideo } from "@/db/schema";

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

function PlayBadge() {
  return (
    <span
      className="flex items-center justify-center rounded-full"
      style={{ width: 44, height: 44, background: "rgba(255,255,255,0.92)", boxShadow: "0 2px 10px rgba(0,0,0,0.28)" }}
    >
      <span
        style={{
          marginLeft: 3,
          width: 0,
          height: 0,
          borderTop: "8px solid transparent",
          borderBottom: "8px solid transparent",
          borderLeft: `13px solid ${tone.ink}`,
        }}
      />
    </span>
  );
}

export function TrainingLibrary({
  groups,
  watermark,
}: {
  groups: [string, TrainingVideo[]][];
  watermark: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(
    () => Object.fromEntries(groups.map(([c]) => [c, true])),
  );
  const [active, setActive] = useState<TrainingVideo | null>(null);

  return (
    <div className="space-y-4">
      {groups.map(([category, items]) => {
        const isOpen = open[category] ?? true;
        return (
          <section
            key={category}
            className="rounded-xl overflow-hidden"
            style={{ border: `1px solid ${tone.line}`, background: tone.card }}
          >
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [category]: !isOpen }))}
              className="w-full flex items-center justify-between px-5 py-4 transition-colors hover:bg-[#FAF7F0]"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-serif" style={{ fontSize: 18, color: tone.ink }}>
                  {category}
                </span>
                <span className="text-[12px]" style={{ color: tone.ink50 }}>
                  {items.length} 个视频
                </span>
              </div>
              <Chevron open={isOpen} />
            </button>

            {isOpen && (
              <div className="px-5 pb-5 grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((v) => {
                  const thumb = streamThumbnailUrl(v.cloudflareUid);
                  return (
                    <button key={v.id} type="button" onClick={() => setActive(v)} className="group text-left">
                      <div className="relative aspect-video overflow-hidden rounded-lg" style={{ background: tone.ink }}>
                        {thumb && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt={v.title}
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        )}
                        <span className="absolute inset-0 flex items-center justify-center opacity-90 transition-opacity group-hover:opacity-100">
                          <PlayBadge />
                        </span>
                        {v.durationLabel && (
                          <span
                            className="absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 text-[10px]"
                            style={{ background: "rgba(0,0,0,0.72)", color: "#fff" }}
                          >
                            {v.durationLabel}
                          </span>
                        )}
                        {!v.isPublished && (
                          <span
                            className="absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px] uppercase"
                            style={{ background: tone.amberSoft, color: tone.amber }}
                          >
                            hidden
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-[13px] leading-snug line-clamp-2" style={{ color: tone.ink }}>
                        {v.title}
                      </div>
                    </button>
                  );
                })}
              </div>
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
                关闭 ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
