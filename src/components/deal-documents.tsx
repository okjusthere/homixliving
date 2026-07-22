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
  createdAt: string | null;
};

const M = {
  en: {
    title: "Documents",
    hint: "Lease, application, guarantor docs — keep the deal file complete.",
    upload: "Upload",
    uploading: "Uploading…",
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
  const t = M[useLocale()];
  const [docs, setDocs] = useState<DealDocumentItem[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals/${dealType}/${dealId}/documents`);
      if (res.ok) setDocs(await res.json());
    } catch {
      // keep previous list
    }
  }, [dealType, dealId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
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
          }),
        });
        if (!res.ok) throw new Error((await res.json())?.error || "register failed");
      }
      toast.success(t.uploaded);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(
        /not configured/i.test(message)
          ? t.notConfigured
          : `${t.uploadFailed}${message ? `: ${message}` : ""}`
      );
    } finally {
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
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? t.uploading : t.upload}
          </Btn>
        </div>
      </div>

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
