"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Upload } from "lucide-react";
import { Card } from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";

type CompanyW9Metadata = {
  objectKey: string | null;
  fileName: string | null;
  uploadedAt: string | null;
};

const M = {
  en: {
    eyebrow: "Company reference",
    title: "Company documents & policies",
    description:
      "Official forms and company-wide policies used in day-to-day deal work.",
    w9Title: "Company W-9",
    w9Description:
      "Homix Living Inc. tax form. It is also attached automatically to Rental invoice emails.",
    currentFile: "Current file",
    bundledFile: "Bundled company W-9",
    uploaded: (date: string) => `Updated ${date}`,
    view: "View W-9",
    upload: "Upload W-9",
    replace: "Replace W-9",
    uploading: "Uploading…",
    uploadHint: "Admin only · PDF · max 8 MB",
    invalid: "Please select a PDF up to 8 MB.",
    failed: "Upload failed. Please retry.",
    done: "Company W-9 updated.",
  },
  zh: {
    eyebrow: "公司资料",
    title: "公司文件与政策",
    description: "经纪人日常做单所需的公司正式文件与统一政策。",
    w9Title: "Company W-9",
    w9Description:
      "Homix Living Inc. 税务表格；发送 Rental invoice 邮件时也会自动作为附件。",
    currentFile: "当前文件",
    bundledFile: "系统内置 Company W-9",
    uploaded: (date: string) => `更新于 ${date}`,
    view: "查看 W-9",
    upload: "上传 W-9",
    replace: "更换 W-9",
    uploading: "上传中…",
    uploadHint: "仅管理员 · PDF · 最大 8 MB",
    invalid: "请选择不超过 8 MB 的 PDF 文件。",
    failed: "上传失败，请重试。",
    done: "Company W-9 已更新。",
  },
} as const;

const MAX_COMPANY_W9_BYTES = 8 * 1024 * 1024;

function formatDate(value: string | null, locale: "en" | "zh"): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function CompanyDocuments({
  initialW9,
  isAdmin,
}: {
  initialW9: CompanyW9Metadata;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const locale = useLocale();
  const t = M[locale];
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const uploadedDate = formatDate(initialW9.uploadedAt, locale);

  async function upload(file: File | null) {
    if (!file) return;
    setMessage(null);
    setIsError(false);
    if (
      file.type !== "application/pdf" ||
      !file.name.toLowerCase().endsWith(".pdf") ||
      file.size > MAX_COMPANY_W9_BYTES
    ) {
      setMessage(t.invalid);
      setIsError(true);
      return;
    }

    setBusy(true);
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch("/api/resources/company-w9", {
        method: "POST",
        body: form,
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || t.failed);
      setMessage(t.done);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.failed);
      setIsError(true);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <p
          className="text-[11px] uppercase tracking-[0.12em]"
          style={{ color: tone.ink50 }}
        >
          {t.eyebrow}
        </p>
        <h2
          className="mt-1 font-serif"
          style={{ color: tone.ink, fontSize: 22 }}
        >
          {t.title}
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: tone.ink50 }}>
          {t.description}
        </p>
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-4">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
              style={{ background: tone.paperDeep, color: tone.accent }}
            >
              <FileText size={20} strokeWidth={1.7} aria-hidden />
            </div>
            <div className="min-w-0">
              <h3 className="text-[15px] font-medium" style={{ color: tone.ink }}>
                {t.w9Title}
              </h3>
              <p
                className="mt-1 max-w-2xl text-[12.5px] leading-relaxed"
                style={{ color: tone.ink50 }}
              >
                {t.w9Description}
              </p>
              <p className="mt-2 text-[12px]" style={{ color: tone.ink70 }}>
                <span style={{ color: tone.ink50 }}>{t.currentFile}: </span>
                {initialW9.fileName || t.bundledFile}
                {uploadedDate ? ` · ${t.uploaded(uploadedDate)}` : ""}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <a
              href="/api/resources/company-w9"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[13px] font-medium"
              style={{
                background: tone.card,
                border: `1px solid ${tone.line}`,
                color: tone.ink,
              }}
            >
              <ExternalLink size={15} aria-hidden />
              {t.view}
            </a>
            {isAdmin && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[13px] font-medium disabled:opacity-50"
                  style={{ background: tone.ink, color: "#fff" }}
                >
                  <Upload size={15} aria-hidden />
                  {busy
                    ? t.uploading
                    : initialW9.objectKey
                      ? t.replace
                      : t.upload}
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  disabled={busy}
                  onChange={(event) =>
                    upload(event.target.files?.[0] ?? null)
                  }
                />
              </>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="mt-3 pl-0 sm:pl-[60px]">
            <p className="text-[11.5px]" style={{ color: tone.ink50 }}>
              {t.uploadHint}
            </p>
            {message && (
              <p
                role="status"
                className="mt-1 text-[12px]"
                style={{ color: isError ? tone.rose : tone.green }}
              >
                {message}
              </p>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
