"use client";

import React from "react";
import { tone } from "./tokens";
import {
  IconDashboard,
  IconDoc,
  IconPlus,
  IconBuilding,
  IconGear,
  IconSearch,
  IconSend,
  IconDownload,
  IconTrash,
  IconCheck,
  IconArrow,
  IconBack,
  IconClock,
  IconMail,
  IconEye,
  IconEdit,
  IconFilter,
  IconChev,
  IconChevDown,
  IconCopy,
  IconClose,
} from "./icons";

// Re-export all icons as an Icons namespace for client components
export const Icons = {
  Dashboard: IconDashboard,
  Doc: IconDoc,
  Plus: IconPlus,
  Building: IconBuilding,
  Gear: IconGear,
  Search: IconSearch,
  Send: IconSend,
  Download: IconDownload,
  Trash: IconTrash,
  Check: IconCheck,
  Arrow: IconArrow,
  Back: IconBack,
  Clock: IconClock,
  Mail: IconMail,
  Eye: IconEye,
  Edit: IconEdit,
  Filter: IconFilter,
  Chev: IconChev,
  ChevDown: IconChevDown,
  Copy: IconCopy,
  Close: IconClose,
};

// -------------- Pill (status chip) --------------
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
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: palette.dot }} />
      {children}
    </span>
  );
}

// -------------- Button --------------
type BtnVariant = "primary" | "outline" | "ghost" | "danger";
type BtnSize = "sm" | "md" | "lg";

export function Btn({
  variant = "primary",
  size = "md",
  children,
  onClick,
  icon,
  className = "",
  disabled,
  type = "button",
  asChild: _asChild,
}: {
  variant?: BtnVariant;
  size?: BtnSize;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  asChild?: boolean;
}) {
  const base =
    "inline-flex items-center gap-2 font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";
  const sizes: Record<BtnSize, string> = {
    sm: "h-8 px-3 text-[13px]",
    md: "h-10 px-4 text-sm",
    lg: "h-11 px-5 text-sm",
  };
  const variants: Record<BtnVariant, string> = {
    primary: "text-white rounded-lg",
    outline: "rounded-lg",
    ghost: "rounded-md",
    danger: "rounded-lg",
  };
  const style: Record<BtnVariant, React.CSSProperties> = {
    primary: {
      background: tone.ink,
      color: "#fff",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 2px rgba(0,0,0,0.06)",
    },
    outline: { background: tone.card, color: tone.ink, border: `1px solid ${tone.line}` },
    ghost: { background: "transparent", color: tone.ink70 },
    danger: { background: tone.card, color: tone.rose, border: `1px solid ${tone.roseSoft}` },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      style={style[variant]}
    >
      {icon}
      {children}
    </button>
  );
}

// -------------- Card --------------
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

// -------------- SoftField --------------
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
      <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
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

// -------------- Homix Brand Mark --------------
// Visual parity with HomixMark in server-primitives.tsx and src/app/icon.svg —
// edit both copies together when touching the brand.
export function HomixMark({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
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
        <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: tone.ink50 }}>
          Invoice Suite
        </div>
      </div>
    </div>
  );
}

// -------------- Text Input (editorial) --------------
export function EditorialInput({
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
  prefix,
  className = "",
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  prefix?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center h-10 px-3 rounded-lg ${className}`}
      style={{ background: tone.card, border: `1px solid ${tone.line}` }}
    >
      {prefix && (
        <span className="mr-2 text-[13px]" style={{ color: tone.ink50 }}>
          {prefix}
        </span>
      )}
      <input
        value={value}
        type={type}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`flex-1 bg-transparent outline-none text-[13.5px] ${mono ? "font-mono" : ""}`}
        style={{ color: tone.ink }}
      />
    </div>
  );
}

export function LabeledField({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div style={{ gridColumn: wide ? "1 / -1" : undefined }}>
      <div className="text-[11px] uppercase tracking-[0.1em] mb-2" style={{ color: tone.ink50 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
