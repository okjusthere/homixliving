"use client";

import { useState } from "react";
import type { AnonymousSuggestionStatus } from "@/db/schema";
import { Card } from "@/components/homix/primitives";
import { fmtDate, tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";

type Row = {
  id: string; category: string; message: string; locale: string; status: AnonymousSuggestionStatus;
  adminNote: string | null; createdAt: string; updatedAt: string;
};

const STATUSES: AnonymousSuggestionStatus[] = ["new", "reviewing", "planned", "closed"];

export function FeedbackInbox({ initialRows }: { initialRows: Row[] }) {
  const locale = useLocale();
  const [rows, setRows] = useState(initialRows);
  async function update(row: Row, status: AnonymousSuggestionStatus) {
    const response = await fetch("/api/suggestions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, status, adminNote: row.adminNote }),
    });
    if (response.ok) setRows((old) => old.map((item) => item.id === row.id ? { ...item, status } : item));
  }
  if (!rows.length) return <Card className="p-6 text-[13px]" style={{ color: tone.ink50 }}>{locale === "zh" ? "暂无建议。" : "No feedback yet."}</Card>;
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={row.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase" style={{ color: tone.ink50 }}>{row.category} · {fmtDate(row.createdAt)}</div>
              <p className="mt-2 whitespace-pre-wrap text-[14px] leading-6" style={{ color: tone.ink }}>{row.message}</p>
            </div>
            <select value={row.status} onChange={(event) => void update(row, event.target.value as AnonymousSuggestionStatus)} className="h-9 rounded-lg px-2 text-[12px]" style={{ border: `1px solid ${tone.line}`, background: tone.card, color: tone.ink }}>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
        </Card>
      ))}
    </div>
  );
}
