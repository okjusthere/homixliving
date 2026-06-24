"use client";

/**
 * Shared page-level UI kit — the source of truth for page headers, filter tabs,
 * search, and data tables across the app. Pages should compose these instead of
 * hand-rolling headers/tables with inline styles, so the whole app stays
 * visually consistent.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { tone } from "./tokens";
import { Icons } from "./primitives";

/** Standard page header: eyebrow + serif title + right-aligned actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div
            className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em]"
            style={{ color: tone.ink50 }}
          >
            {eyebrow}
          </div>
        )}
        <h1
          className="font-serif"
          style={{ fontSize: 40, lineHeight: 1.02, letterSpacing: "-0.01em", color: tone.ink }}
        >
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[14px] leading-6" style={{ color: tone.ink50 }}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Container for a filters/search row beneath a PageHeader. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3">{children}</div>;
}

/** Segmented filter tabs (e.g. status filters), with optional counts. */
export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: tone.paperDeep }}>
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className="flex h-8 items-center gap-2 rounded-md px-3 text-[12.5px] font-medium transition-colors"
            style={{
              background: selected ? tone.card : "transparent",
              color: selected ? tone.ink : tone.ink50,
              boxShadow: selected ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
            }}
          >
            {o.label}
            {o.count !== undefined && (
              <span className="font-mono text-[11px]" style={{ color: selected ? tone.ink50 : tone.ink30 }}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Standard search field. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex h-9 min-w-[260px] items-center gap-2 rounded-md px-3 ${className}`}
      style={{ background: tone.card, border: `1px solid ${tone.line}` }}
    >
      <span style={{ color: tone.ink30 }}>
        <Icons.Search />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-[13px] outline-none"
        style={{ color: tone.ink }}
      />
    </div>
  );
}

/** Header row for a Card section: serif title + optional subtitle + action. */
export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-5 py-4"
      style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
    >
      <div className="min-w-0">
        <div className="font-serif" style={{ fontSize: 17, color: tone.ink }}>
          {title}
        </div>
        {subtitle && (
          <div className="mt-0.5 text-[12px]" style={{ color: tone.ink50 }}>
            {subtitle}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export type Column<T> = {
  key: string;
  label: string;
  /** CSS grid track, e.g. "2.2fr" or "120px". */
  width: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
};

/** Consistent data table built on a CSS grid. Replaces the ad-hoc `<div>` grids
 *  each list page used to hand-roll. Rows can navigate (`getHref`), fire a
 *  callback (`onRowClick`, e.g. to open an edit dialog), or be static. */
export function DataTable<T>({
  columns,
  rows,
  getHref,
  onRowClick,
  getKey,
  loading,
  emptyTitle = "Nothing here yet",
  emptyAction,
}: {
  columns: Column<T>[];
  rows: T[];
  getHref?: (row: T) => string;
  onRowClick?: (row: T) => void;
  getKey: (row: T) => string | number;
  loading?: boolean;
  emptyTitle?: string;
  emptyAction?: ReactNode;
}) {
  const gridCols = columns.map((c) => c.width).join(" ");
  const rowClass = "grid w-full items-center px-6 py-4 text-left transition-colors";
  return (
    <div className="overflow-hidden rounded-xl" style={{ background: tone.card, border: `1px solid ${tone.line}` }}>
      <div
        className="grid px-6 py-3 text-[11px] font-medium uppercase tracking-[0.1em]"
        style={{ gridTemplateColumns: gridCols, color: tone.ink50, borderBottom: `1px solid ${tone.lineSoft}` }}
      >
        {columns.map((c) => (
          <div key={c.key} className={c.align === "right" ? "text-right" : ""}>
            {c.label}
          </div>
        ))}
      </div>
      {loading ? (
        <div className="px-6 py-12 text-center text-[13px]" style={{ color: tone.ink50 }}>
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <div className="font-serif" style={{ fontSize: 22, color: tone.ink }}>
            {emptyTitle}
          </div>
          {emptyAction && <div className="mt-3">{emptyAction}</div>}
        </div>
      ) : (
        rows.map((row, i) => {
          const style = {
            gridTemplateColumns: gridCols,
            borderBottom: i < rows.length - 1 ? `1px solid ${tone.lineSoft}` : "none",
          };
          const cells = columns.map((c) => (
            <div key={c.key} className={c.align === "right" ? "text-right" : ""}>
              {c.render(row)}
            </div>
          ));
          if (getHref) {
            return (
              <Link
                key={getKey(row)}
                href={getHref(row)}
                className={`${rowClass} hover:bg-[#FAF7F0]`}
                style={style}
              >
                {cells}
              </Link>
            );
          }
          if (onRowClick) {
            return (
              <div
                key={getKey(row)}
                role="button"
                tabIndex={0}
                onClick={() => onRowClick(row)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick(row);
                  }
                }}
                className={`${rowClass} cursor-pointer hover:bg-[#FAF7F0]`}
                style={style}
              >
                {cells}
              </div>
            );
          }
          return (
            <div key={getKey(row)} className={rowClass} style={style}>
              {cells}
            </div>
          );
        })
      )}
    </div>
  );
}
