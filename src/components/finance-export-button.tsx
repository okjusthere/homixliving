"use client";

import { Btn } from "@/components/homix/primitives";
import { IconDownload } from "@/components/homix/icons";
import { useLocale } from "@/lib/i18n-client";

const M = {
  en: { export: "Export CSV" },
  zh: { export: "导出 CSV" },
} as const;

// The ledger rows arrive pre-filtered and pre-localized from the server page,
// so the CSV matches exactly what's on screen.
export type FinanceExportRow = {
  date: string;
  payerName: string;
  payerEmail: string;
  product: string;
  typeLabel: string;
  status: string;
  amountCents: number;
};

// RFC 4180: wrap in quotes, double embedded quotes.
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function FinanceExportButton({ rows }: { rows: FinanceExportRow[] }) {
  const t = M[useLocale()];

  function exportCsv() {
    const header = "Date,Payer,Email,Product,Type,Status,Amount (USD)";
    const lines = rows.map((r) =>
      [
        r.date.slice(0, 10),
        csvField(r.payerName),
        csvField(r.payerEmail),
        csvField(r.product),
        csvField(r.typeLabel),
        r.status,
        (r.amountCents / 100).toFixed(2),
      ].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `homix-finance-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Btn variant="outline" size="sm" icon={<IconDownload />} onClick={exportCsv} disabled={rows.length === 0}>
      {t.export}
    </Btn>
  );
}
