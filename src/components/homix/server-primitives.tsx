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
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <rect x="1" y="1" width="38" height="38" rx="8" fill={tone.ink} />
        <path d="M11 27V13h3v5.5h6V13h3v14h-3v-6h-6v6h-3z" fill={tone.paper} />
        <circle cx="30" cy="13.5" r="1.6" fill={tone.accent} />
      </svg>
      <div className="leading-[1.05]">
        <div
          className="font-serif tracking-tight"
          style={{ color: tone.ink, fontSize: 19, letterSpacing: "-0.01em" }}
        >
          Homix
        </div>
        <div
          className="text-[10px] uppercase tracking-[0.18em]"
          style={{ color: tone.ink50 }}
        >
          Invoice Suite
        </div>
      </div>
    </div>
  );
}
