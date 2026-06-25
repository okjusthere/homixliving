"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, EditorialInput } from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import type { Resource } from "@/db/schema";

const M = {
  en: {
    manageResources: "Manage resources",
    lead: "Paste a link to a doc, template, or folder (Google Drive, Notion, Dropbox, or a file URL).",
    close: "Close",
    addResource: "Add resource",
    titleRequired: "Title and link (URL) are required.",
    saveFailed: "Could not save — admin only.",
    confirmDelete: (title: string) => `Delete "${title}"?`,
    title: "Title",
    category: "Category (e.g. Scripts)",
    link: "Link (https://…)",
    description: "Short description (optional)",
    saving: "Saving…",
    saveResource: "Save resource",
    published: "Published",
    hidden: "Hidden",
    delete: "Delete",
  },
  zh: {
    manageResources: "管理资料",
    lead: "粘贴文档、模板或文件夹的链接（Google Drive、Notion、Dropbox 或文件 URL）。",
    close: "关闭",
    addResource: "添加资料",
    titleRequired: "请填写标题和链接（URL）。",
    saveFailed: "保存失败，仅管理员可操作。",
    confirmDelete: (title: string) => `删除“${title}”？`,
    title: "标题",
    category: "类别（例如：话术）",
    link: "链接（https://…）",
    description: "简短描述（可选）",
    saving: "保存中…",
    saveResource: "保存资料",
    published: "已发布",
    hidden: "已隐藏",
    delete: "删除",
  },
} as const;

export function ResourceManager({ initialResources }: { initialResources: Resource[] }) {
  const router = useRouter();
  const t = M[useLocale()];
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    if (!title.trim() || !url.trim()) {
      setError(t.titleRequired);
      return;
    }
    setBusy(true);
    const res = await fetch("/api/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, url, category, description }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(t.saveFailed);
      return;
    }
    setTitle("");
    setUrl("");
    setCategory("");
    setDescription("");
    router.refresh();
  }

  async function togglePublish(r: Resource) {
    await fetch(`/api/resources/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !r.isPublished }),
    });
    router.refresh();
  }

  async function remove(r: Resource) {
    if (!confirm(t.confirmDelete(r.title))) return;
    await fetch(`/api/resources/${r.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Card className="p-5 mb-10" style={{ background: tone.paper }}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-serif" style={{ fontSize: 16, color: tone.ink }}>
            {t.manageResources}
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: tone.ink50 }}>
            {t.lead}
          </div>
        </div>
        <Btn variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? t.close : t.addResource}
        </Btn>
      </div>

      {open && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <EditorialInput value={title} onChange={setTitle} placeholder={t.title} />
          <EditorialInput value={category} onChange={setCategory} placeholder={t.category} />
          <div className="sm:col-span-2">
            <EditorialInput value={url} onChange={setUrl} placeholder={t.link} mono />
          </div>
          <div className="sm:col-span-2">
            <EditorialInput value={description} onChange={setDescription} placeholder={t.description} />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <Btn variant="primary" size="sm" onClick={add} disabled={busy}>
              {busy ? t.saving : t.saveResource}
            </Btn>
            {error && (
              <span className="text-[12.5px]" style={{ color: tone.rose }}>
                {error}
              </span>
            )}
          </div>
        </div>
      )}

      {initialResources.length > 0 && (
        <div className="mt-5">
          {initialResources.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 py-2.5"
              style={{ borderTop: `1px solid ${tone.lineSoft}` }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] truncate" style={{ color: tone.ink }}>
                  {r.title}
                </div>
                <div className="text-[11.5px] truncate font-mono" style={{ color: tone.ink50 }}>
                  {r.category} · {r.url}
                </div>
              </div>
              <button
                type="button"
                onClick={() => togglePublish(r)}
                className="text-[12px] px-2.5 py-1 rounded-md"
                style={{ color: r.isPublished ? tone.green : tone.ink50, background: tone.paperDeep }}
              >
                {r.isPublished ? t.published : t.hidden}
              </button>
              <button
                type="button"
                onClick={() => remove(r)}
                className="text-[12px] px-2.5 py-1 rounded-md"
                style={{ color: tone.rose }}
              >
                {t.delete}
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
