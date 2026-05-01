"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Pill, Btn, Card, Icons } from "@/components/homix/primitives";
import { tone, fmtMoney, fmtDate } from "@/components/homix/tokens";

type InvoiceRow = {
  invoice: {
    id: number;
    invoiceNumber: string;
    unit: string;
    tenantName: string;
    agentName: string | null;
    totalAmount: number;
    status: string;
    createdAt: string;
    licensedCompany: string;
  };
  buildingName: string | null;
  buildingRegion: string | null;
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "draft" | "sent" | "paid" | "failed">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/invoices")
      .then((r) => r.json())
      .then((data) => {
        setInvoices(data);
        setLoading(false);
      });
  }, []);

  const counts = useMemo(() => {
    const c = { all: invoices.length, draft: 0, sent: 0, paid: 0, failed: 0 };
    for (const row of invoices) {
      const s = row.invoice.status as keyof typeof c;
      if (s in c) c[s]++;
    }
    return c;
  }, [invoices]);

  const filtered = useMemo(() => {
    return invoices.filter((row) => {
      if (status !== "all" && row.invoice.status !== status) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        row.invoice.invoiceNumber.toLowerCase().includes(q) ||
        row.invoice.tenantName.toLowerCase().includes(q) ||
        (row.buildingName || "").toLowerCase().includes(q) ||
        row.invoice.unit.toLowerCase().includes(q)
      );
    });
  }, [invoices, status, search]);

  const statuses: { id: "all" | "draft" | "sent" | "paid" | "failed"; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "draft", label: "Draft", count: counts.draft },
    { id: "sent", label: "Sent", count: counts.sent },
    { id: "paid", label: "Paid", count: counts.paid },
    { id: "failed", label: "Failed", count: counts.failed },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div
            className="text-[11px] uppercase tracking-[0.16em] mb-2"
            style={{ color: tone.ink50 }}
          >
            Documents
          </div>
          <h1
            className="font-serif"
            style={{
              fontSize: 52,
              lineHeight: 0.95,
              letterSpacing: "-0.02em",
              color: tone.ink,
            }}
          >
            Invoices
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/invoices/new">
            <Btn variant="primary" icon={<Icons.Plus />}>
              New Invoice
            </Btn>
          </Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div
          className="flex items-center gap-1 p-1 rounded-lg"
          style={{ background: tone.paperDeep }}
        >
          {statuses.map((s) => (
            <button
              key={s.id}
              onClick={() => setStatus(s.id)}
              className="px-3 h-8 rounded-md text-[12.5px] font-medium transition-colors flex items-center gap-2"
              style={{
                background: status === s.id ? tone.card : "transparent",
                color: status === s.id ? tone.ink : tone.ink50,
                boxShadow: status === s.id ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
              }}
            >
              {s.label}
              <span
                className="text-[11px] font-mono"
                style={{ color: status === s.id ? tone.ink50 : tone.ink30 }}
              >
                {s.count}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 h-9 px-3 rounded-md min-w-[280px]"
            style={{ background: tone.card, border: `1px solid ${tone.line}` }}
          >
            <span style={{ color: tone.ink30 }}>
              <Icons.Search />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by number, tenant, building…"
              className="flex-1 bg-transparent outline-none text-[13px]"
              style={{ color: tone.ink }}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <Card>
        <div
          className="grid text-[11px] uppercase tracking-[0.1em] px-6 py-3"
          style={{
            gridTemplateColumns: "1.5fr 2fr 1fr 1fr 1fr 0.6fr",
            color: tone.ink50,
            borderBottom: `1px solid ${tone.lineSoft}`,
          }}
        >
          <div>Invoice</div>
          <div>Building / Tenant</div>
          <div>Agent</div>
          <div>Issued</div>
          <div className="text-right">Amount</div>
          <div className="text-right">Status</div>
        </div>
        {loading ? (
          <div className="px-6 py-12 text-center text-[13px]" style={{ color: tone.ink50 }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center" style={{ color: tone.ink50 }}>
            {invoices.length === 0 ? (
              <>
                <div
                  className="font-serif mb-2"
                  style={{ fontSize: 22, color: tone.ink, letterSpacing: "-0.01em" }}
                >
                  No invoices yet
                </div>
                <p className="text-[13px]">
                  <Link href="/invoices/new" style={{ color: tone.accent }} className="underline">
                    Create your first invoice
                  </Link>
                </p>
              </>
            ) : (
              <p className="text-[13px]">No results match your filters.</p>
            )}
          </div>
        ) : (
          filtered.map(({ invoice, buildingName }, i) => (
            <Link
              key={invoice.id}
              href={`/invoices/${invoice.id}`}
              className="grid w-full text-left px-6 py-4 transition-colors items-center hover:bg-[#FAF7F0]"
              style={{
                gridTemplateColumns: "1.5fr 2fr 1fr 1fr 1fr 0.6fr",
                borderBottom: i < filtered.length - 1 ? `1px solid ${tone.lineSoft}` : "none",
              }}
            >
              <div>
                <div className="font-mono text-[12.5px]" style={{ color: tone.ink }}>
                  {invoice.invoiceNumber}
                </div>
                <div className="text-[11.5px] mt-0.5" style={{ color: tone.ink50 }}>
                  Unit {invoice.unit}
                </div>
              </div>
              <div>
                <div className="text-[13px]" style={{ color: tone.ink }}>
                  {buildingName || "—"}
                </div>
                <div className="text-[11.5px] mt-0.5" style={{ color: tone.ink50 }}>
                  {invoice.tenantName}
                </div>
              </div>
              <div className="text-[12.5px]" style={{ color: tone.ink70 }}>
                {invoice.agentName || "—"}
              </div>
              <div className="text-[12.5px] font-mono" style={{ color: tone.ink70 }}>
                {invoice.createdAt ? fmtDate(invoice.createdAt) : "—"}
              </div>
              <div
                className="text-right font-serif"
                style={{ fontSize: 18, color: tone.ink, letterSpacing: "-0.01em" }}
              >
                ${fmtMoney(invoice.totalAmount)}
              </div>
              <div className="text-right">
                <Pill
                  tone={
                    invoice.status === "paid"
                      ? "sent"
                      : invoice.status === "sent"
                      ? "accent"
                      : invoice.status === "failed"
                      ? "failed"
                      : "draft"
                  }
                >
                  {invoice.status === "paid"
                    ? "Paid"
                    : invoice.status === "sent"
                    ? "Sent"
                    : invoice.status === "failed"
                    ? "Failed"
                    : "Draft"}
                </Pill>
              </div>
            </Link>
          ))
        )}
      </Card>
    </div>
  );
}
