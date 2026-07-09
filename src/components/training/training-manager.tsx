"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, EditorialInput } from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";
import { TRAINING_CATEGORIES } from "@/lib/training-categories";
import type { TrainingVideo } from "@/db/schema";
import { useLocale } from "@/lib/i18n-client";
import type { TrainingVideoViewRecord, TrainingVideoViewSummary } from "@/lib/training-views";

const M = {
  en: {
    titleUidRequired: "Title and Cloudflare UID are required.",
    saveFailed: "Could not save — admin only.",
    confirmDelete: (t: string) => `Delete "${t}"?`,
    manageVideos: "Manage videos",
    videosAdminOnly: (n: number) => `${n} videos · admin only`,
    bulkImportHint: "Bulk-import from Cloudflare with the script, or add one by pasting its UID.",
    close: "Close",
    addVideo: "Add video",
    moveToEnd: "Move to end",
    cloudflareWarnPre: "Set ",
    cloudflareWarnPost: " in Vercel so the videos can play.",
    titlePlaceholder: "Title",
    uidPlaceholder: "Cloudflare Stream UID",
    categoryLabel: "Category",
    durationPlaceholder: "Duration (e.g. 8 min)",
    descriptionPlaceholder: "Short description (optional)",
    saving: "Saving…",
    saveVideo: "Save video",
    published: "Published",
    hidden: "Hidden",
    delete: "Delete",
    viewedBy: (n: number) => `Viewed by ${n} ${n === 1 ? "agent" : "agents"}`,
    noViews: "No views yet",
    lastViewed: "Last viewed",
    viewers: "Viewers",
    agent: "Agent",
    firstViewed: "First viewed",
    lastViewedColumn: "Last viewed",
    opens: "Opens",
  },
  zh: {
    titleUidRequired: "标题和 Cloudflare UID 为必填项。",
    saveFailed: "无法保存 — 仅限管理员。",
    confirmDelete: (t: string) => `确定删除「${t}」？`,
    manageVideos: "管理视频",
    videosAdminOnly: (n: number) => `${n} 个视频 · 仅限管理员`,
    bulkImportHint: "用脚本从 Cloudflare 批量导入，或粘贴 UID 逐个添加。",
    close: "关闭",
    addVideo: "添加视频",
    moveToEnd: "移到末尾",
    cloudflareWarnPre: "请在 Vercel 中设置 ",
    cloudflareWarnPost: "，视频才能播放。",
    titlePlaceholder: "标题",
    uidPlaceholder: "Cloudflare Stream UID",
    categoryLabel: "类别",
    durationPlaceholder: "时长（例如 8 分钟）",
    descriptionPlaceholder: "简短描述（可选）",
    saving: "保存中…",
    saveVideo: "保存视频",
    published: "已发布",
    hidden: "隐藏",
    delete: "删除",
    viewedBy: (n: number) => `${n} 位经纪人看过`,
    noViews: "还没人看过",
    lastViewed: "最近观看",
    viewers: "观看名单",
    agent: "经纪人",
    firstViewed: "首次观看",
    lastViewedColumn: "最近观看",
    opens: "打开次数",
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

function formatViewDate(value: string | null | undefined, locale: "en" | "zh") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function viewerName(viewer: TrainingVideoViewRecord) {
  return viewer.agentName?.trim() || viewer.agentEmail;
}

export function TrainingManager({
  initialVideos,
  initialViewSummaries,
  cloudflareConfigured,
}: {
  initialVideos: TrainingVideo[];
  initialViewSummaries: TrainingVideoViewSummary[];
  cloudflareConfigured: boolean;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = M[locale];
  const [panelOpen, setPanelOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [openViewers, setOpenViewers] = useState<Record<number, boolean>>({});
  const [title, setTitle] = useState("");
  const [uid, setUid] = useState("");
  const [category, setCategory] = useState<string>(TRAINING_CATEGORIES[0]);
  const [duration, setDuration] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewsByVideo = new Map(initialViewSummaries.map((summary) => [summary.videoId, summary]));

  async function add() {
    setError(null);
    if (!title.trim() || !uid.trim()) {
      setError(t.titleUidRequired);
      return;
    }
    setBusy(true);
    const res = await fetch("/api/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        cloudflareUid: uid,
        category,
        durationLabel: duration,
        description,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(t.saveFailed);
      return;
    }
    setTitle("");
    setUid("");
    setCategory(TRAINING_CATEGORIES[0]);
    setDuration("");
    setDescription("");
    router.refresh();
  }

  async function patch(v: TrainingVideo, body: Record<string, unknown>) {
    await fetch(`/api/training/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  async function remove(v: TrainingVideo) {
    if (!confirm(t.confirmDelete(v.title))) return;
    await fetch(`/api/training/${v.id}`, { method: "DELETE" });
    router.refresh();
  }

  // Push a video past every other video in its own category (used to fix
  // upload-order vs. intended-viewing-order mismatches without hand-editing
  // every sibling's sortOrder).
  async function moveToEnd(v: TrainingVideo) {
    const maxOrder = initialVideos
      .filter((x) => x.category === v.category && x.id !== v.id)
      .reduce((max, x) => Math.max(max, x.sortOrder), 0);
    await patch(v, { sortOrder: maxOrder + 10 });
  }

  return (
    <Card className="p-5 mb-10" style={{ background: tone.paper }}>
      <button
        type="button"
        onClick={() => setPanelOpen((p) => !p)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div>
          <div className="font-serif" style={{ fontSize: 16, color: tone.ink }}>
            {t.manageVideos}
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: tone.ink50 }}>
            {t.videosAdminOnly(initialVideos.length)}
          </div>
        </div>
        <Chevron open={panelOpen} />
      </button>

      {panelOpen && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-[12px]" style={{ color: tone.ink50 }}>
              {t.bulkImportHint}
            </div>
            <Btn variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
              {open ? t.close : t.addVideo}
            </Btn>
          </div>

          {!cloudflareConfigured && (
            <div
              className="mt-3 rounded-lg p-3 text-[12.5px]"
              style={{ background: tone.amberSoft, color: tone.amber }}
            >
              {t.cloudflareWarnPre}
              <span className="font-mono">NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE</span>
              {t.cloudflareWarnPost}
            </div>
          )}

          {open && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <EditorialInput value={title} onChange={setTitle} placeholder={t.titlePlaceholder} />
              <EditorialInput value={uid} onChange={setUid} placeholder={t.uidPlaceholder} mono />
              <div
                className="flex items-center h-10 px-3 rounded-lg"
                style={{ background: tone.card, border: `1px solid ${tone.line}` }}
              >
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-[13.5px]"
                  style={{ color: tone.ink }}
                  aria-label={t.categoryLabel}
                >
                  {TRAINING_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <EditorialInput value={duration} onChange={setDuration} placeholder={t.durationPlaceholder} />
              <div className="sm:col-span-2">
                <EditorialInput value={description} onChange={setDescription} placeholder={t.descriptionPlaceholder} />
              </div>
              <div className="sm:col-span-2 flex items-center gap-3">
                <Btn variant="primary" size="sm" onClick={add} disabled={busy}>
                  {busy ? t.saving : t.saveVideo}
                </Btn>
                {error && (
                  <span className="text-[12.5px]" style={{ color: tone.rose }}>
                    {error}
                  </span>
                )}
              </div>
            </div>
          )}

          {initialVideos.length > 0 && (
            <div className="mt-5">
              {initialVideos.map((v) => {
                const catOptions = TRAINING_CATEGORIES.includes(v.category)
                  ? TRAINING_CATEGORIES
                  : [v.category, ...TRAINING_CATEGORIES];
                const summary = viewsByVideo.get(v.id);
                const viewerCount = summary?.viewerCount || 0;
                const viewersOpen = openViewers[v.id] ?? false;
                const lastViewer = summary?.lastViewerName || summary?.lastViewerEmail;
                return (
                  <div
                    key={v.id}
                    style={{ borderTop: `1px solid ${tone.lineSoft}` }}
                  >
                    <div className="flex flex-wrap items-center gap-3 py-2.5">
                      <div className="min-w-[220px] flex-1">
                        <div className="text-[13.5px] truncate" style={{ color: tone.ink }}>
                          {v.title}
                        </div>
                        <div className="text-[11.5px] truncate font-mono" style={{ color: tone.ink50 }}>
                          {v.cloudflareUid}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
                          <button
                            type="button"
                            disabled={viewerCount === 0}
                            onClick={() => setOpenViewers((state) => ({ ...state, [v.id]: !viewersOpen }))}
                            className="rounded-full px-2 py-0.5 font-medium disabled:cursor-default"
                            style={{
                              background: viewerCount > 0 ? tone.paperDeep : "transparent",
                              color: viewerCount > 0 ? tone.accent : tone.ink50,
                              border: viewerCount > 0 ? `1px solid ${tone.line}` : "1px solid transparent",
                            }}
                          >
                            {viewerCount > 0 ? t.viewedBy(viewerCount) : t.noViews}
                          </button>
                          {lastViewer && (
                            <span style={{ color: tone.ink50 }}>
                              {t.lastViewed}: {lastViewer} · {formatViewDate(summary?.lastViewedAt, locale)}
                            </span>
                          )}
                        </div>
                      </div>
                      <select
                        value={v.category}
                        onChange={(e) => patch(v, { category: e.target.value })}
                        className="text-[12px] px-2 py-1 rounded-md outline-none"
                        style={{ background: tone.paperDeep, color: tone.ink70, border: `1px solid ${tone.line}` }}
                        aria-label={t.categoryLabel}
                      >
                        {catOptions.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => patch(v, { isPublished: !v.isPublished })}
                        className="text-[12px] px-2.5 py-1 rounded-md"
                        style={{ color: v.isPublished ? tone.green : tone.ink50, background: tone.paperDeep }}
                      >
                        {v.isPublished ? t.published : t.hidden}
                      </button>
                      <button
                        type="button"
                        onClick={() => moveToEnd(v)}
                        className="text-[12px] px-2.5 py-1 rounded-md"
                        style={{ color: tone.ink50, background: tone.paperDeep }}
                      >
                        {t.moveToEnd}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(v)}
                        className="text-[12px] px-2.5 py-1 rounded-md"
                        style={{ color: tone.rose }}
                      >
                        {t.delete}
                      </button>
                    </div>
                    {viewerCount > 0 && viewersOpen && summary && (
                      <div
                        className="mb-3 overflow-hidden rounded-lg"
                        style={{ border: `1px solid ${tone.line}`, background: tone.paperDeep }}
                      >
                        <div className="px-3 py-2 text-[12px] font-medium" style={{ color: tone.ink70 }}>
                          {t.viewers}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-left text-[12px]">
                            <thead style={{ color: tone.ink50 }}>
                              <tr style={{ borderTop: `1px solid ${tone.lineSoft}` }}>
                                <th className="px-3 py-2 font-medium">{t.agent}</th>
                                <th className="px-3 py-2 font-medium">{t.firstViewed}</th>
                                <th className="px-3 py-2 font-medium">{t.lastViewedColumn}</th>
                                <th className="px-3 py-2 text-right font-medium">{t.opens}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {summary.viewers.map((viewer) => (
                                <tr
                                  key={viewer.agentEmail}
                                  style={{ borderTop: `1px solid ${tone.lineSoft}`, color: tone.ink70 }}
                                >
                                  <td className="px-3 py-2">
                                    <div className="font-medium" style={{ color: tone.ink }}>
                                      {viewerName(viewer)}
                                    </div>
                                    {viewer.agentName && (
                                      <div className="font-mono text-[11px]" style={{ color: tone.ink50 }}>
                                        {viewer.agentEmail}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2">{formatViewDate(viewer.firstViewedAt, locale)}</td>
                                  <td className="px-3 py-2">{formatViewDate(viewer.lastViewedAt, locale)}</td>
                                  <td className="px-3 py-2 text-right font-mono">{viewer.openCount}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
