"use client";

import { useState } from "react";
import { Eye, X, ExternalLink } from "lucide-react";
import type { SigningPackage } from "@/lib/signing-contract";
import { signingButton } from "./client";
import { SigningPdfReview } from "./pdf-review";

export function SigningPackagePreview({
  item,
  zh,
}: {
  item: SigningPackage;
  zh: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const files = item.definition.flatMap((part, partIndex) =>
    part.files.map((file, fileIndex) => ({
      title: part.files.length === 1 ? part.title : file.title,
      id: `${partIndex}-${fileIndex}`,
      partIndex,
      fileIndex,
    })),
  );
  const file = files[selected];
  if (!file) return null;
  const url = `/api/signing/packages/${item.id}/files?partIndex=${file.partIndex}&fileIndex=${file.fileIndex}`;
  return (
    <div className="sm:col-span-2">
      <button
        type="button"
        className={signingButton}
        aria-expanded={open}
        aria-controls={`package-preview-${item.id}`}
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={16} /> : <Eye size={16} />}
        {open
          ? zh
            ? "收起预览"
            : "Close preview"
          : zh
            ? `预览文件（${files.length}）`
            : `Preview documents (${files.length})`}
      </button>
      {open && (
        <section
          id={`package-preview-${item.id}`}
          aria-label={zh ? "公司文件预览" : "Company document preview"}
          className="mt-3 space-y-3"
        >
          <p className="text-sm text-ink-50">
            {zh
              ? "这是公司模板原文，尚未填入客户和交易资料。可先查看内容，再填写下方资料。"
              : "These are the company templates, before client and transaction details are filled in. Review the contents before completing the form below."}
          </p>
          {files.length > 1 && (
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={zh ? "选择预览文件" : "Choose a document to preview"}
            >
              {files.map((candidate, index) => (
                <button
                  type="button"
                  key={candidate.id}
                  aria-pressed={selected === index}
                  onClick={() => setSelected(index)}
                  className={`${signingButton} ${selected === index ? "ring-2 ring-ink font-medium" : ""}`}
                >
                  {index + 1}. {candidate.title}
                </button>
              ))}
            </div>
          )}
          <SigningPdfReview
            key={file.id}
            sourceUrl={url}
            file={{ id: file.id, partId: "", title: file.title, fields: [] }}
            zh={zh}
          />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${signingButton} inline-flex`}
          >
            <ExternalLink size={14} />
            {zh ? "下载原始 PDF" : "Download original PDF"}
          </a>
        </section>
      )}
    </div>
  );
}
