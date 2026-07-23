"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Btn, Card } from "@/components/homix/primitives";
import { CardHeader } from "@/components/homix/page-kit";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";

type DealDocumentItem = {
  id: number;
  dealType: string;
  dealId: number;
  fileName: string;
  contentType: string | null;
  size: number | null;
  uploadedByEmail: string | null;
  checklistItemId: number | null;
  createdAt: string | null;
};

type ChecklistGroup = {
  key: string;
  labelEn: string;
  labelZh: string;
  items: {
    id: number;
    label: string;
    documents: { id: number; fileName: string }[];
  }[];
};

const M = {
  en: {
    title: "Documents",
    hint: "Lease, application, guarantor docs — keep the deal file complete.",
    upload: "Upload",
    uploading: "Uploading…",
    required: "Required documents",
    uploadFor: "Upload",
    otherDocs: "Other files",
    empty: "No documents yet.",
    delete: "Delete",
    confirmDelete: (name: string) => `Delete "${name}"?`,
    uploadFailed: "Upload failed",
    deleteFailed: "Delete failed — edit rights required.",
    uploaded: "Uploaded",
    notConfigured: "Document storage is not configured yet (configure the private R2 bucket).",
  },
  zh: {
    title: "成交文件",
    hint: "租约、申请材料、担保文件——请把做单文件传齐。",
    upload: "上传文件",
    uploading: "上传中…",
    required: "必交材料清单",
    uploadFor: "上传",
    otherDocs: "其他文件",
    empty: "还没有上传文件。",
    delete: "删除",
    confirmDelete: (name: string) => `确定删除「${name}」？`,
    uploadFailed: "上传失败",
    deleteFailed: "删除失败——需要该单的编辑权限。",
    uploaded: "已上传",
    notConfigured: "文件存储尚未配置（需配置私有 Cloudflare R2 bucket）。",
  },
} as const;

function fmtSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DealDocuments({
  dealType,
  dealId,
}: {
  dealType: "rental" | "sale";
  dealId: number;
}) {
  const locale = useLocale();
  const t = M[locale];
  const [docs, setDocs] = useState<DealDocumentItem[]>([]);
  const [checklist, setChecklist] = useState<ChecklistGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // When an item's own "upload" link opened the picker, the next selected
  // file(s) register against that checklist item.
  const pendingItemRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [docsRes, checklistRes] = await Promise.all([
        fetch(`/api/deals/${dealType}/${dealId}/documents`),
        fetch(`/api/deals/${dealType}/${dealId}/checklist`),
      ]);
      if (docsRes.ok) setDocs(await docsRes.json());
      if (checklistRes.ok) setChecklist((await checklistRes.json()).groups ?? []);
    } catch {
      // keep previous list
    }
  }, [dealType, dealId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) {
      pendingItemRef.current = null;
      return;
    }
    const checklistItemId = pendingItemRef.current;
    pendingItemRef.current = null;
    setBusy(true);
    try {
      for (const file of files) {
        const prepareRes = await fetch("/api/documents/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dealType,
            dealId,
            fileName: file.name,
            contentType: file.type,
            size: file.size,
          }),
        });
        const prepared = await prepareRes.json().catch(() => ({}));
        if (!prepareRes.ok) {
          throw new Error(prepared.error || "prepare failed");
        }

        const uploadRes = await fetch(prepared.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploadRes.ok) throw new Error("storage upload failed");

        const res = await fetch(`/api/deals/${dealType}/${dealId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objectKey: prepared.objectKey,
            fileName: file.name,
            contentType: file.type || null,
            size: file.size,
            checklistItemId,
          }),
        });
        if (!res.ok) throw new Error((await res.json())?.error || "register failed");
      }
      toast.success(t.uploaded);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(
        /not configured/i.test(message)
          ? t.notConfigured
          : `${t.uploadFailed}${message ? `: ${message}` : ""}`
      );
    } finally {
      // Refresh even on failure — files registered before the failing one
      // are real and must show up (docs list AND checklist ticks).
      await load();
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(doc: DealDocumentItem) {
    if (!confirm(t.confirmDelete(doc.fileName))) return;
    const res = await fetch(
      `/api/deals/${dealType}/${dealId}/documents/${doc.id}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast.error(t.deleteFailed);
      return;
    }
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    // A deleted upload may have been the one satisfying a checklist item.
    if (doc.checklistItemId != null) await load();
  }

  return (
    <Card>
      <CardHeader title={t.title} />
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-[12px]" style={{ color: tone.ink50 }}>
          {t.hint}
        </div>
        <div className="flex-none">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={onPick}
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.txt"
          />
          <Btn
            variant="outline"
            size="sm"
            onClick={() => {
              // Clear any leftover per-item target from a cancelled picker so
              // a generic upload never silently ticks a checklist box.
              pendingItemRef.current = null;
              fileRef.current?.click();
            }}
            disabled={busy}
          >
            {busy ? t.uploading : t.upload}
          </Btn>
        </div>
      </div>

      {checklist.length > 0 && (
        <div className="mb-4 space-y-3">
          {checklist.map((group) => {
            const done = group.items.filter((i) => i.documents.length > 0).length;
            return (
              <div key={group.key}>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <div
                    className="text-[11px] uppercase tracking-[0.12em]"
                    style={{ color: tone.ink50 }}
                  >
                    {t.required} · {locale === "zh" ? group.labelZh : group.labelEn}
                  </div>
                  <span
                    className="text-[11.5px] font-mono flex-none"
                    style={{ color: done === group.items.length ? tone.green : tone.ink50 }}
                  >
                    {done}/{group.items.length}
                  </span>
                </div>
                <div>
                  {group.items.map((item) => {
                    const satisfied = item.documents.length > 0;
                    return (
                      <div
                        key={item.id}
                        className="flex items-start gap-2 py-1.5"
                        style={{ borderTop: `1px solid ${tone.lineSoft}` }}
                      >
                        <span
                          className="flex-none text-[13px] leading-5"
                          style={{ color: satisfied ? tone.green : tone.ink30 }}
                        >
                          {satisfied ? "✓" : "○"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-[12.5px] leading-5"
                            style={{ color: satisfied ? tone.ink70 : tone.ink }}
                          >
                            {item.label}
                          </div>
                          {satisfied && (
                            <div className="text-[11.5px] truncate" style={{ color: tone.ink50 }}>
                              {item.documents.map((d, i) => (
                                <a
                                  key={d.id}
                                  href={`/api/deals/${dealType}/${dealId}/documents/${d.id}/download`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:underline"
                                >
                                  {i > 0 ? "、" : ""}
                                  {d.fileName}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        {!satisfied && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              pendingItemRef.current = item.id;
                              fileRef.current?.click();
                            }}
                            className="flex-none text-[12px] font-medium underline decoration-dotted"
                            style={{ color: tone.accent }}
                          >
                            {t.uploadFor}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div
            className="text-[11px] uppercase tracking-[0.12em] pt-1"
            style={{ color: tone.ink50 }}
          >
            {t.otherDocs}
          </div>
        </div>
      )}

      {docs.length === 0 ? (
        <div className="text-[12.5px] py-2" style={{ color: tone.ink50 }}>
          {t.empty}
        </div>
      ) : (
        <div>
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 py-2"
              style={{ borderTop: `1px solid ${tone.lineSoft}` }}
            >
              <a
                href={`/api/deals/${dealType}/${dealId}/documents/${doc.id}/download`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-w-0 text-[13px] truncate hover:underline"
                style={{ color: tone.ink }}
              >
                {doc.fileName}
              </a>
              <span className="text-[11.5px] flex-none" style={{ color: tone.ink30 }}>
                {fmtSize(doc.size)}
              </span>
              <span
                className="text-[11.5px] flex-none hidden sm:inline truncate max-w-[160px]"
                style={{ color: tone.ink50 }}
              >
                {doc.uploadedByEmail || ""}
              </span>
              <button
                type="button"
                onClick={() => remove(doc)}
                className="text-[12px] px-2 py-0.5 rounded-md flex-none"
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
