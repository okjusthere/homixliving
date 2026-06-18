// Server-safe primitives (no hooks, no event handlers)
// Usable in both Server Components and Client Components.
import React from "react";
import { tone } from "./tokens";

export type PillTone = "neutral" | "sent" | "draft" | "failed" | "accent";

export function Pill({
  tone: t = "neutral",
  children,
  className = "",
}: {
  tone?: PillTone;
  children: React.ReactNode;
  className?: string;
}) {
  const palette = {
    neutral: { bg: tone.paperDeep, fg: tone.ink70, dot: tone.ink50 },
    sent: { bg: tone.greenSoft, fg: tone.green, dot: tone.green },
    draft: { bg: tone.amberSoft, fg: tone.amber, dot: tone.amber },
    failed: { bg: tone.roseSoft, fg: tone.rose, dot: tone.rose },
    accent: { bg: tone.accentSoft, fg: tone.accent, dot: tone.accent },
  }[t];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase ${className}`}
      style={{ background: palette.bg, color: palette.fg, letterSpacing: "0.06em" }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: palette.dot }}
      />
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
  style: s,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{ background: tone.card, border: `1px solid ${tone.line}`, ...s }}
    >
      {children}
    </div>
  );
}

export function SoftField({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value?: React.ReactNode;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div
        className="text-[11px] uppercase tracking-[0.1em]"
        style={{ color: tone.ink50 }}
      >
        {label}
      </div>
      <div
        className={`mt-1 text-[13.5px] leading-snug ${mono ? "font-mono" : ""}`}
        style={{ color: tone.ink }}
      >
        {value || "—"}
      </div>
      {hint && (
        <div className="text-xs mt-0.5" style={{ color: tone.ink50 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function HomixMark({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      {/*
        Brand mark — paper-tone rounded square with the walnut roof+chimney
        silhouette filling it. Same geometry as src/app/icon.svg so the favicon
        and the in-app mark are visually consistent.
      */}
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        <rect
          x="1"
          y="1"
          width="62"
          height="62"
          rx="12"
          fill={tone.paper}
          stroke={tone.line}
          strokeWidth="1"
        />
        <path
          d="M 8 48 L 32 16 L 44 30 L 44 22 L 52 22 L 52 38 L 56 48 Z"
          fill={tone.brand}
        />
      </svg>
      <div className="leading-[1.05]">
        <div
          className="font-serif"
          style={{
            color: tone.brand,
            fontSize: 20,
            letterSpacing: "0.04em",
            fontWeight: 400,
          }}
        >
          HOMIX
        </div>
        <div
          className="text-[10px] uppercase tracking-[0.18em]"
          style={{ color: tone.ink50 }}
        >
          Deals
        </div>
      </div>
    </div>
  );
}
