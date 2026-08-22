"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLocale } from "@/lib/i18n-client";
import {
  prepareHeadshotSource,
  ProfileImageError,
  type ProfileImageErrorCode,
} from "@/lib/profile-image-client";

const M = {
  en: {
    portrait: "Portrait 4:5",
    square: "Square 1:1",
    dropPrefix: "Drop a photo here, or",
    choose: "choose a file",
    takePhoto: "take a photo",
    photoHint: "On mobile, you can take a photo. A clean, solid background works best.",
    zoom: "Zoom",
    dragHint: "Drag the photo to reposition it.",
    fileHint: "HEIC, HEIF, JPG, PNG, WebP, or GIF. Phone photos are converted automatically.",
    processing: "Preparing photo…",
    errors: {
      source_too_large: "The original photo is larger than 25 MB.",
      unsupported_image: "Choose a HEIC, HEIF, JPG, PNG, WebP, or GIF image.",
      heic_conversion_failed: "This HEIC/HEIF photo could not be converted. Try exporting it as JPG.",
      image_decode_failed: "This photo could not be read. Try a different file.",
      output_too_large: "This photo is still too large after processing.",
    },
  },
  zh: {
    portrait: "竖版 4:5",
    square: "方形 1:1",
    dropPrefix: "拖照片到这里，或",
    choose: "选择文件",
    takePhoto: "拍照",
    photoHint: "手机可直接拍照；干净纯色背景的证件照效果最好。",
    zoom: "缩放",
    dragHint: "拖动照片可调整位置。",
    fileHint: "支持 HEIC、HEIF、JPG、PNG、WebP 或 GIF；手机照片会自动转换。",
    processing: "正在处理照片…",
    errors: {
      source_too_large: "原始照片超过 25 MB，请选择较小的照片。",
      unsupported_image: "请选择 HEIC、HEIF、JPG、PNG、WebP 或 GIF 图片。",
      heic_conversion_failed: "这张 HEIC/HEIF 照片无法转换，请尝试导出为 JPG 后再上传。",
      image_decode_failed: "无法读取这张照片，请换一张重试。",
      output_too_large: "处理后的照片仍然太大，请换一张重试。",
    },
  },
} as const;

/**
 * Dependency-free headshot cropper (ported from the marketing site). The agent
 * picks/drops/shoots a photo, pans + zooms within a fixed frame, and on every
 * adjustment renders the visible region to an offscreen canvas and writes the
 * resulting JPEG into a hidden <input type="file" name={name}> — so a form/
 * FormData reading `photo` gets the cropped image. No pick → input stays empty
 * and the current headshot is kept. Ratio: Portrait 4:5 (default) or Square 1:1.
 */

const FRAME_W = 240;
const OUT_W = 880;
const MAX_ZOOM = 4;

type Ratio = "portrait" | "square";
const ASPECT: Record<Ratio, number> = { portrait: 4 / 5, square: 1 };

export function AvatarCropper({
  name,
  currentSrc,
  alt,
  onPick,
  onFileReady,
  onProcessingChange,
  onError,
}: {
  name: string;
  currentSrc: string;
  alt: string;
  /** Fired true once a cropped photo has been written to the hidden input. */
  onPick?: (hasPhoto: boolean) => void;
  /** Provides the processed file without relying on DataTransfer support. */
  onFileReady?: (file: File | null) => void;
  onProcessingChange?: (processing: boolean) => void;
  onError?: (message: string | null) => void;
}) {
  const t = M[useLocale()];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileNameRef = useRef<string>("");
  const loadVersionRef = useRef(0);
  const renderVersionRef = useRef(0);

  const onPickRef = useRef(onPick);
  const onFileReadyRef = useRef(onFileReady);
  const onProcessingChangeRef = useRef(onProcessingChange);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onPickRef.current = onPick;
    onFileReadyRef.current = onFileReady;
    onProcessingChangeRef.current = onProcessingChange;
    onErrorRef.current = onError;
  }, [onError, onFileReady, onPick, onProcessingChange]);

  const [ratio, setRatio] = useState<Ratio>("portrait");
  const [editing, setEditing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aspect = ASPECT[ratio];
  const FRAME_H = Math.round(FRAME_W / aspect);
  const OUT_H = Math.round(OUT_W / aspect);

  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const coverScale = useCallback(
    (img: HTMLImageElement) =>
      Math.max(FRAME_W / img.naturalWidth, FRAME_H / img.naturalHeight),
    [FRAME_H],
  );

  const clampOff = useCallback(
    (x: number, y: number, scale: number) => {
      const img = imgRef.current;
      if (!img) return { x, y };
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      return {
        x: Math.min(0, Math.max(FRAME_W - dw, x)),
        y: Math.min(0, Math.max(FRAME_H - dh, y)),
      };
    },
    [FRAME_H],
  );

  const render = useCallback(
    (scale: number, off: { x: number; y: number }) => {
      const img = imgRef.current;
      if (!img) return;
      const renderVersion = ++renderVersionRef.current;
      setProcessing(true);
      onProcessingChangeRef.current?.(true);
      const sx = -off.x / scale;
      const sy = -off.y / scale;
      const sw = FRAME_W / scale;
      const sh = FRAME_H / scale;

      const c = previewCanvasRef.current;
      if (c) {
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, FRAME_W, FRAME_H);
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, FRAME_W, FRAME_H);
        }
      }

      const out = document.createElement("canvas");
      out.width = OUT_W;
      out.height = OUT_H;
      const octx = out.getContext("2d");
      if (!octx) {
        const message = t.errors.image_decode_failed;
        setError(message);
        onErrorRef.current?.(message);
        setProcessing(false);
        onProcessingChangeRef.current?.(false);
        return;
      }
      octx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);
      out.toBlob(
        (blob) => {
          if (renderVersion !== renderVersionRef.current) return;
          if (!blob) {
            const message = t.errors.image_decode_failed;
            setError(message);
            onErrorRef.current?.(message);
            setProcessing(false);
            onProcessingChangeRef.current?.(false);
            return;
          }
          const base = (fileNameRef.current || "headshot").replace(/\.[^.]+$/, "");
          const file = new File([blob], `${base}.jpg`, { type: "image/jpeg" });
          try {
            if (fileInputRef.current && typeof DataTransfer !== "undefined") {
              const dt = new DataTransfer();
              dt.items.add(file);
              fileInputRef.current.files = dt.files;
            }
          } catch {
            // Safari and embedded browsers may not permit assigning input.files.
          }
          onFileReadyRef.current?.(file);
          onPickRef.current?.(true);
          setProcessing(false);
          onProcessingChangeRef.current?.(false);
        },
        "image/jpeg",
        0.9,
      );
    },
    [FRAME_H, OUT_H, t.errors.image_decode_failed],
  );

  const loadFile = useCallback(
    async (source: File) => {
      const loadVersion = ++loadVersionRef.current;
      setProcessing(true);
      setError(null);
      onErrorRef.current?.(null);
      onProcessingChangeRef.current?.(true);
      onFileReadyRef.current?.(null);
      onPickRef.current?.(false);
      let file: File;
      try {
        file = await prepareHeadshotSource(source);
      } catch (cause) {
        if (loadVersion !== loadVersionRef.current) return;
        const code: ProfileImageErrorCode =
          cause instanceof ProfileImageError ? cause.code : "image_decode_failed";
        const message = t.errors[code];
        setError(message);
        onErrorRef.current?.(message);
        setProcessing(false);
        onProcessingChangeRef.current?.(false);
        return;
      }
      if (loadVersion !== loadVersionRef.current) return;
      fileNameRef.current = source.name;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        if (loadVersion !== loadVersionRef.current) {
          URL.revokeObjectURL(url);
          return;
        }
        imgRef.current = img;
        const cs = Math.max(FRAME_W / img.naturalWidth, FRAME_H / img.naturalHeight);
        const dw = img.naturalWidth * cs;
        const dh = img.naturalHeight * cs;
        const start = { x: (FRAME_W - dw) / 2, y: (FRAME_H - dh) / 2 };
        setZoom(1);
        setOffset(start);
        setEditing(true);
        requestAnimationFrame(() => render(cs, start));
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        if (loadVersion !== loadVersionRef.current) {
          URL.revokeObjectURL(url);
          return;
        }
        URL.revokeObjectURL(url);
        const message = t.errors.image_decode_failed;
        setError(message);
        onErrorRef.current?.(message);
        setProcessing(false);
        onProcessingChangeRef.current?.(false);
      };
      img.src = url;
    },
    [FRAME_H, render, t.errors],
  );

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !editing) return;
    render(coverScale(img) * zoom, offset);
  }, [zoom, offset, editing, render, coverScale]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !editing) return;
    const cs = Math.max(FRAME_W / img.naturalWidth, FRAME_H / img.naturalHeight);
    const dw = img.naturalWidth * cs;
    const dh = img.naturalHeight * cs;
    setZoom(1);
    setOffset({ x: (FRAME_W - dw) / 2, y: (FRAME_H - dh) / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratio]);

  const onZoom = (z: number) => {
    const img = imgRef.current;
    if (!img) return;
    const newZoom = Math.min(MAX_ZOOM, Math.max(1, z));
    const cs = coverScale(img);
    const scale = cs * newZoom;
    const prevScale = cs * zoom;
    const k = scale / prevScale;
    const cx = FRAME_W / 2;
    const cy = FRAME_H / 2;
    const nx = cx - (cx - offset.x) * k;
    const ny = cy - (cy - offset.y) * k;
    setZoom(newZoom);
    setOffset(clampOff(nx, ny, scale));
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!imgRef.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    const img = imgRef.current;
    if (!d || !img) return;
    const scale = coverScale(img) * zoom;
    setOffset(clampOff(d.ox + (e.clientX - d.x), d.oy + (e.clientY - d.y), scale));
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" name={name} accept="image/*,.heic,.heif" className="sr-only" tabIndex={-1} />

      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="shrink-0">
          {editing ? (
            <div
              className="relative cursor-grab touch-none select-none overflow-hidden rounded-sm bg-line/50 active:cursor-grabbing"
              style={{ width: FRAME_W, height: FRAME_H }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <canvas ref={previewCanvasRef} width={FRAME_W} height={FRAME_H} className="block" />
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 border border-paper/40" />
                <div className="absolute left-1/3 top-0 h-full w-px bg-paper/25" />
                <div className="absolute left-2/3 top-0 h-full w-px bg-paper/25" />
                <div className="absolute top-1/3 left-0 h-px w-full bg-paper/25" />
                <div className="absolute top-2/3 left-0 h-px w-full bg-paper/25" />
              </div>
            </div>
          ) : (
            <div
              className="relative overflow-hidden rounded-sm bg-line/50"
              style={{ width: FRAME_W, height: FRAME_H }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentSrc} alt={alt} className="h-full w-full object-cover" />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-3">
          <div className="inline-flex rounded-sm border border-line p-0.5 text-xs">
            {(["portrait", "square"] as Ratio[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRatio(r)}
                className={`rounded-[1px] px-3 py-1.5 transition-colors ${
                  ratio === r ? "bg-ink text-paper" : "text-ink-50 hover:text-ink"
                }`}
              >
                {r === "portrait" ? t.portrait : t.square}
              </button>
            ))}
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void loadFile(f);
            }}
            className={`flex flex-col items-center justify-center rounded-sm border border-dashed px-4 py-5 text-center transition-colors ${
              dragOver ? "border-bronze bg-bronze/5" : "border-line bg-surface"
            }`}
          >
            <p className="text-sm text-ink">
              {t.dropPrefix}{" "}
              <label className="cursor-pointer text-bronze underline-offset-4 hover:underline">
                {t.choose}
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.currentTarget.value = "";
                    if (f) void loadFile(f);
                  }}
                />
              </label>{" "}
              <span className="text-ink-50">·</span>{" "}
              <label className="cursor-pointer text-bronze underline-offset-4 hover:underline sm:hidden">
                {t.takePhoto}
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  capture="user"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.currentTarget.value = "";
                    if (f) void loadFile(f);
                  }}
                />
              </label>
            </p>
            <p className="mt-1 text-xs text-ink-50">
              {t.photoHint}
            </p>
          </div>

          {editing && (
            <label className="flex items-center gap-3 text-xs text-ink-50">
              <span className="w-9 shrink-0">{t.zoom}</span>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => onZoom(Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-bronze"
                aria-label={t.zoom}
              />
            </label>
          )}
          <p className={`text-xs ${error ? "text-red-700" : "text-ink-50"}`}>
            {error || (processing ? t.processing : editing ? t.dragHint : t.fileHint)}
          </p>
        </div>
      </div>
    </div>
  );
}
