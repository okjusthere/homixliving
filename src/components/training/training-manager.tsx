"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, EditorialInput } from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";
import { TRAINING_CATEGORIES } from "@/lib/training-categories";
import type { TrainingVideo } from "@/db/schema";
import { useLocale } from "@/lib/i18n-client";

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

export function TrainingManager({
  initialVideos,
  cloudflareConfigured,
}: {
  initialVideos: TrainingVideo[];
  cloudflareConfigured: boolean;
}) {
  const router = useRouter();
  const t = M[useLocale()];
  const [panelOpen, setPanelOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [uid, setUid] = useState("");
  const [category, setCategory] = useState<string>(TRAINING_CATEGORIES[0]);
  const [duration, setDuration] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
                return (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 py-2.5"
                    style={{ borderTop: `1px solid ${tone.lineSoft}` }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] truncate" style={{ color: tone.ink }}>
                        {v.title}
                      </div>
                      <div className="text-[11.5px] truncate font-mono" style={{ color: tone.ink50 }}>
                        {v.cloudflareUid}
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
                      onClick={() => remove(v)}
                      className="text-[12px] px-2.5 py-1 rounded-md"
                      style={{ color: tone.rose }}
                    >
                      {t.delete}
                    </button>
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
