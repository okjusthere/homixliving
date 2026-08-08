"use client";

import { useRef, useState } from "react";
import {
  ExternalLink,
  FileText,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Card, Pill } from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import type { CompanyW9DocumentMetadata } from "@/lib/company-w9-model";

const M = {
  en: {
    eyebrow: "Company reference",
    title: "Company W-9s",
    description:
      "Official tax forms for Homix legal entities. Choose the company named on the related paperwork.",
    rentalDefault: "Rental invoice default",
    defaultDescription:
      "Homix Living Inc. W-9. This is the only W-9 attached automatically to Rental invoice emails.",
    otherDescription:
      "Use this W-9 when paperwork or payment is issued under this legal entity.",
    currentFile: "Current file",
    bundledFile: "Bundled with the portal",
    uploaded: (date: string) => `Updated ${date}`,
    view: "View",
    add: "Add company W-9",
    replace: "Replace",
    delete: "Delete",
    uploading: "Uploading…",
    deleting: "Deleting…",
    addTitle: "Add a legal entity",
    companyName: "Legal company name",
    companyPlaceholder: "e.g. Homix Realty Inc.",
    pdfFile: "W-9 PDF",
    save: "Upload W-9",
    cancel: "Cancel",
    uploadHint: "Admin only · PDF · max 8 MB · up to 20 companies",
    invalid: "Please select a PDF up to 8 MB.",
    missingCompany: "Enter the legal company name.",
    failed: "Upload failed. Please retry.",
    deleteFailed: "Delete failed. Please retry.",
    done: "Company W-9 saved.",
    deleted: "Company W-9 deleted.",
    confirmDelete: (company: string) =>
      `Delete the ${company} W-9? This cannot be undone.`,
  },
  zh: {
    eyebrow: "公司资料",
    title: "公司 W-9",
    description: "Homix 各法律主体的正式税务表格，请按相关合同或付款主体选用。",
    rentalDefault: "租赁发票默认附件",
    defaultDescription:
      "Homix Living Inc. W-9；这是发送租赁发票邮件时唯一自动附带的 W-9。",
    otherDescription: "合同或付款使用该法律主体时，请选用这份 W-9。",
    currentFile: "当前文件",
    bundledFile: "系统内置文件",
    uploaded: (date: string) => `更新于 ${date}`,
    view: "查看",
    add: "新增公司 W-9",
    replace: "更换",
    delete: "删除",
    uploading: "上传中…",
    deleting: "删除中…",
    addTitle: "新增法律主体",
    companyName: "公司法定名称",
    companyPlaceholder: "例如 Homix Realty Inc.",
    pdfFile: "W-9 PDF 文件",
    save: "上传 W-9",
    cancel: "取消",
    uploadHint: "仅管理员 · PDF · 最大 8 MB · 最多 20 家公司",
    invalid: "请选择不超过 8 MB 的 PDF 文件。",
    missingCompany: "请输入公司法定名称。",
    failed: "上传失败，请重试。",
    deleteFailed: "删除失败，请重试。",
    done: "公司 W-9 已保存。",
    deleted: "公司 W-9 已删除。",
    confirmDelete: (company: string) =>
      `确定删除 ${company} 的 W-9 吗？此操作无法撤销。`,
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

function validPdf(file: File): boolean {
  return (
    file.type === "application/pdf" &&
    file.name.toLowerCase().endsWith(".pdf") &&
    file.size <= MAX_COMPANY_W9_BYTES
  );
}

export function CompanyDocuments({
  initialW9s,
  isAdmin,
}: {
  initialW9s: CompanyW9DocumentMetadata[];
  isAdmin: boolean;
}) {
  const locale = useLocale();
  const t = M[locale];
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<CompanyW9DocumentMetadata | null>(null);
  const [documents, setDocuments] = useState(initialW9s);
  const [showAdd, setShowAdd] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function showMessage(value: string, error = false) {
    setMessage(value);
    setIsError(error);
  }

  async function upload(
    file: File | null,
    target: CompanyW9DocumentMetadata | null,
  ) {
    if (!file || !validPdf(file)) {
      showMessage(t.invalid, true);
      return;
    }

    const legalName = target?.companyName || companyName.trim();
    if (!legalName) {
      showMessage(t.missingCompany, true);
      return;
    }

    const operationId = target?.id || "new";
    setBusyId(operationId);
    setMessage(null);
    setIsError(false);
    const form = new FormData();
    form.set("file", file);
    form.set("companyName", legalName);
    if (target) form.set("documentId", target.id);

    try {
      const response = await fetch("/api/resources/company-w9", {
        method: "POST",
        body: form,
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        documents?: CompanyW9DocumentMetadata[];
      };
      if (!response.ok || !body.documents) {
        throw new Error(t.failed);
      }

      setDocuments(body.documents);
      setCompanyName("");
      setAddFile(null);
      setShowAdd(false);
      if (addInputRef.current) addInputRef.current.value = "";
      showMessage(t.done);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : t.failed, true);
    } finally {
      setBusyId(null);
      replaceTargetRef.current = null;
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  }

  async function remove(document: CompanyW9DocumentMetadata) {
    if (!window.confirm(t.confirmDelete(document.companyName))) return;

    setBusyId(document.id);
    setMessage(null);
    setIsError(false);
    try {
      const response = await fetch(
        `/api/resources/company-w9?id=${encodeURIComponent(document.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(t.deleteFailed);
      setDocuments((current) =>
        current.filter((item) => item.id !== document.id),
      );
      showMessage(t.deleted);
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : t.deleteFailed,
        true,
      );
    } finally {
      setBusyId(null);
    }
  }

  function chooseReplacement(document: CompanyW9DocumentMetadata) {
    replaceTargetRef.current = document;
    replaceInputRef.current?.click();
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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
          <p
            className="mt-1 max-w-2xl text-[13px]"
            style={{ color: tone.ink50 }}
          >
            {t.description}
          </p>
        </div>
        {isAdmin && !showAdd && (
          <button
            type="button"
            onClick={() => {
              setShowAdd(true);
              setMessage(null);
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-medium sm:h-10 sm:w-auto"
            style={{ background: tone.ink, color: "#fff" }}
          >
            <Plus size={16} aria-hidden />
            {t.add}
          </button>
        )}
      </div>

      {isAdmin && showAdd && (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-medium" style={{ color: tone.ink }}>
              {t.addTitle}
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setCompanyName("");
                setAddFile(null);
                if (addInputRef.current) addInputRef.current.value = "";
              }}
              aria-label={t.cancel}
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ color: tone.ink50 }}
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
            <label className="min-w-0">
              <span className="text-[12px]" style={{ color: tone.ink70 }}>
                {t.companyName}
              </span>
              <input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                maxLength={120}
                placeholder={t.companyPlaceholder}
                className="mt-1 h-11 w-full min-w-0 rounded-lg px-3 text-[13.5px] outline-none"
                style={{
                  background: tone.card,
                  border: `1px solid ${tone.line}`,
                  color: tone.ink,
                }}
              />
            </label>
            <label className="min-w-0">
              <span className="text-[12px]" style={{ color: tone.ink70 }}>
                {t.pdfFile}
              </span>
              <input
                ref={addInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) =>
                  setAddFile(event.target.files?.[0] ?? null)
                }
                className="mt-1 block h-11 w-full min-w-0 rounded-lg px-3 py-2 text-[12px] file:mr-3 file:border-0 file:bg-transparent file:text-[12px] file:font-medium"
                style={{
                  background: tone.card,
                  border: `1px solid ${tone.line}`,
                  color: tone.ink70,
                }}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="h-11 rounded-lg px-4 text-[13px] font-medium sm:h-10"
              style={{
                background: tone.card,
                border: `1px solid ${tone.line}`,
                color: tone.ink,
              }}
            >
              {t.cancel}
            </button>
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => upload(addFile, null)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-medium disabled:opacity-50 sm:h-10"
              style={{ background: tone.ink, color: "#fff" }}
            >
              <Upload size={15} aria-hidden />
              {busyId === "new" ? t.uploading : t.save}
            </button>
          </div>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {documents.map((document) => {
          const uploadedDate = formatDate(document.uploadedAt, locale);
          const isBusy = busyId === document.id;
          return (
            <Card key={document.id} className="p-5">
              <div className="flex min-w-0 gap-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: tone.paperDeep, color: tone.accent }}
                >
                  <FileText size={20} strokeWidth={1.7} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      className="break-words text-[15px] font-medium"
                      style={{ color: tone.ink }}
                    >
                      {document.companyName}
                    </h3>
                    {document.isRentalInvoiceDefault && (
                      <Pill tone="sent">{t.rentalDefault}</Pill>
                    )}
                  </div>
                  <p
                    className="mt-1 text-[12.5px] leading-relaxed"
                    style={{ color: tone.ink50 }}
                  >
                    {document.isRentalInvoiceDefault
                      ? t.defaultDescription
                      : t.otherDescription}
                  </p>
                  <p
                    className="mt-2 break-words text-[12px]"
                    style={{ color: tone.ink70 }}
                  >
                    <span style={{ color: tone.ink50 }}>
                      {t.currentFile}:{" "}
                    </span>
                    {document.fileName}
                    {document.source === "bundled"
                      ? ` · ${t.bundledFile}`
                      : uploadedDate
                        ? ` · ${t.uploaded(uploadedDate)}`
                        : ""}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 sm:justify-end">
                <a
                  href={`/api/resources/company-w9?id=${encodeURIComponent(document.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-medium sm:h-10 sm:flex-none"
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
                      disabled={busyId !== null}
                      onClick={() => chooseReplacement(document)}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-medium disabled:opacity-50 sm:h-10 sm:flex-none"
                      style={{ background: tone.ink, color: "#fff" }}
                    >
                      <Upload size={15} aria-hidden />
                      {isBusy ? t.uploading : t.replace}
                    </button>
                    {!document.isRentalInvoiceDefault && (
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => remove(document)}
                        aria-label={`${t.delete} ${document.companyName}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg disabled:opacity-50 sm:h-10 sm:w-10"
                        style={{
                          background: tone.card,
                          border: `1px solid ${tone.roseSoft}`,
                          color: tone.rose,
                        }}
                      >
                        <Trash2 size={16} aria-hidden />
                        <span className="sr-only">
                          {isBusy ? t.deleting : t.delete}
                        </span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {isAdmin && (
        <>
          <input
            ref={replaceInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={busyId !== null}
            onChange={(event) =>
              upload(
                event.target.files?.[0] ?? null,
                replaceTargetRef.current,
              )
            }
          />
          <p className="text-[11.5px]" style={{ color: tone.ink50 }}>
            {t.uploadHint}
          </p>
          {message && (
            <p
              role="status"
              className="text-[12px]"
              style={{ color: isError ? tone.rose : tone.green }}
            >
              {message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
