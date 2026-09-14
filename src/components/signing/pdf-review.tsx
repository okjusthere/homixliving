"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { SigningReviewFile } from "@/lib/signing-contract";
import { signingButton } from "./client";

function fieldLabel(type: string, zh: boolean) {
  const names: Record<string, [string, string]> = {
    SIGNATURE: ["签名", "Signature"],
    INITIALS: ["姓名缩写", "Initials"],
    DATE: ["日期", "Date"],
    NAME: ["姓名", "Name"],
    EMAIL: ["邮箱", "Email"],
    TEXT: ["文字", "Text"],
    NUMBER: ["数值", "Number"],
    CHECKBOX: ["勾选项", "Checkbox"],
    RADIO: ["单选项", "Choice"],
    DROPDOWN: ["选择项", "Selection"],
  };
  return names[type]?.[zh ? 0 : 1] || (zh ? "填写项" : "Field");
}
export function SigningPdfReview({
  requestId,
  file,
  zh,
  onViewed,
}: {
  requestId: string;
  file: SigningReviewFile;
  zh: boolean;
  onViewed: (id: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1),
    [pages, setPages] = useState(0);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 612, height: 792 });
  const viewed = useRef(new Set<number>()),
    onViewedRef = useRef(onViewed);
  useEffect(() => {
    onViewedRef.current = onViewed;
  }, [onViewed]);
  useEffect(() => {
    let disposed = false;
    let task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    setError(false);
    setPdf(null);
    setPage(1);
    setReady(false);
    viewed.current.clear();
    const moduleUrl = "/signing-pdf/pdf.min.mjs";
    // Load the pinned browser ESM as-is; rebundling its webpack runtime breaks Next dev.
    void (
      import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ moduleUrl
      ) as Promise<typeof import("pdfjs-dist")>
    )
      .then(async (lib) => {
        if (disposed) return;
        lib.GlobalWorkerOptions.workerSrc = "/signing-pdf/pdf.worker.min.mjs";
        task = lib.getDocument({
          url: `/api/signing/requests/${requestId}/parts/${file.partId}/files?kind=original&itemId=${encodeURIComponent(file.id)}`,
          cMapUrl: "/signing-pdf/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/signing-pdf/standard_fonts/",
          wasmUrl: "/signing-pdf/wasm/",
          isEvalSupported: false,
          enableXfa: false,
        });
        const document = await task.promise;
        if (!disposed) {
          setPdf(document);
          setPages(document.numPages);
        }
      })
      .catch((error) => {
        if (process.env.NODE_ENV === "development")
          console.warn("Signing PDF preview failed", error);
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      void task?.destroy();
    };
  }, [requestId, file.id, file.partId]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let disposed = false;
    let rendering:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    setReady(false);
    void pdf
      .getPage(page)
      .then(async (nativePage) => {
        if (disposed || !canvas.current) return;
        const viewport = nativePage.getViewport({ scale: 1 });
        setDimensions({ width: viewport.width, height: viewport.height });
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        const context = canvas.current.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        canvas.current.width = Math.floor(viewport.width * scale);
        canvas.current.height = Math.floor(viewport.height * scale);
        rendering = nativePage.render({
          canvas: canvas.current,
          canvasContext: context,
          viewport,
          transform: scale !== 1 ? [scale, 0, 0, scale, 0, 0] : undefined,
        });
        await rendering.promise;
        if (!disposed) {
          setReady(true);
          viewed.current.add(page);
          if (viewed.current.size === pdf.numPages)
            onViewedRef.current(file.id);
        }
      })
      .catch((error) => {
        if (process.env.NODE_ENV === "development")
          console.warn("Signing PDF preview failed", error);
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      rendering?.cancel();
    };
  }, [pdf, page, file.id]);
  const fields = file.fields.filter((field) => field.page === page);
  return (
    <section className="space-y-3 rounded-lg border border-line bg-paper p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="break-words text-sm font-medium">{file.title}</h3>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            className={signingButton}
            disabled={!ready || page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {zh ? "上一页" : "Previous"}
          </button>
          <span>
            {page} / {pages || "…"}
          </span>
          <button
            type="button"
            className={signingButton}
            disabled={!ready || page >= pages}
            onClick={() => setPage(page + 1)}
          >
            {zh ? "下一页" : "Next"}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {zh
            ? "PDF 预览未能加载，请刷新后再确认发送。"
            : "The PDF preview could not load. Refresh before confirming delivery."}
        </p>
      )}
      {!ready && !error && (
        <p aria-busy="true" className="text-sm">
          {zh ? "正在加载文件…" : "Loading document…"}
        </p>
      )}
      <div className="overflow-auto">
        <div
          className="relative mx-auto bg-white shadow-sm"
          style={{
            maxWidth: dimensions.width,
            minWidth: 480,
            aspectRatio: `${dimensions.width} / ${dimensions.height}`,
          }}
        >
          <canvas
            ref={canvas}
            className="block h-auto w-full"
            aria-label={`${file.title} — ${zh ? "第" : "page"} ${page}`}
          />
          {ready &&
            fields.map((field) => (
              <div
                key={field.id}
                className={`absolute overflow-hidden border px-1 ${field.value ? "border-sky-400 bg-sky-50/95 text-sky-950" : "border-dashed border-amber-600 bg-amber-50/90 text-amber-900"}`}
                style={{
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                  fontSize: 11,
                }}
                title={
                  field.value ||
                  `${field.recipient} · ${field.label || fieldLabel(field.type, zh)}`
                }
              >
                {field.value ||
                  `${field.recipient} · ${field.label || fieldLabel(field.type, zh)}`}
              </div>
            ))}
        </div>
      </div>
      <ul
        className="space-y-1 text-xs"
        aria-label={zh ? "本页字段核对" : "Review fields on this page"}
      >
        {fields.map((field) => (
          <li key={field.id} className="break-words">
            <span className="font-medium">
              {field.recipient} · {field.label || fieldLabel(field.type, zh)}
              :{" "}
            </span>
            {field.value ||
              (zh ? "待本人填写 / 签署" : "To be filled / signed by recipient")}
            {field.readOnly && (zh ? "（固定预填）" : " (fixed prefill)")}
          </li>
        ))}
      </ul>
    </section>
  );
}
