"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Btn, Card, Icons, Pill } from "@/components/homix/primitives";
import { fmtDate, fmtMoney, tone } from "@/components/homix/tokens";
import { sourceEmoji, sourceLabel } from "@/lib/sources";
import { invoicePaymentTone, type InvoicePaymentSummary } from "@/lib/invoice-payment";
import type { Agent, Building, Deal } from "@/db/schema";

type DealRow = {
  deal: Deal;
  building: Building | null;
  agents: Array<{
    agent: Agent | null;
    sharePct: number;
    isPrimary: boolean;
  }>;
  invoiceCount: number;
  invoiceSummary: InvoicePaymentSummary;
};

function statusTone(status: string) {
  if (status === "completed") return "sent";
  if (status === "cancelled") return "failed";
  return "accent";
}

function paymentDetail(summary: InvoicePaymentSummary) {
  if (summary.status === "awaiting_payment") {
    return `$${fmtMoney(summary.totalOutstanding)} outstanding`;
  }
  if (summary.status === "paid") {
    return summary.paidAt ? `Received ${fmtDate(summary.paidAt)}` : `$${fmtMoney(summary.totalPaid)} received`;
  }
  if (summary.status === "draft") {
    return `${summary.invoiceCount} draft invoice${summary.invoiceCount === 1 ? "" : "s"}`;
  }
  if (summary.status === "failed") {
    return "Needs resend";
  }
  return "Create invoice when ready";
}

export default function DealsPage() {
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "cancelled" | "completed">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/rental")
      .then((r) => r.json())
      .then((data) => {
        setDeals(data);
        setLoading(false);
      });
  }, []);

  const counts = useMemo(() => {
    const c = { all: deals.length, active: 0, cancelled: 0, completed: 0 };
    for (const row of deals) {
      const s = row.deal.status as keyof typeof c;
      if (s in c) c[s]++;
    }
    return c;
  }, [deals]);

  const filtered = useMemo(() => {
    return deals.filter((row) => {
      if (status !== "all" && row.deal.status !== status) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        row.deal.tenantName.toLowerCase().includes(q) ||
        row.deal.unit.toLowerCase().includes(q) ||
        (row.building?.name || "").toLowerCase().includes(q) ||
        row.agents.some((participant) =>
          (participant.agent?.name || "").toLowerCase().includes(q)
        )
      );
    });
  }, [deals, search, status]);

  const statuses: { id: typeof status; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "active", label: "Active", count: counts.active },
    { id: "cancelled", label: "Cancelled", count: counts.cancelled },
    { id: "completed", label: "Completed", count: counts.completed },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] mb-2" style={{ color: tone.ink50 }}>
            Pipeline
          </div>
          <h1 className="font-serif" style={{ fontSize: 52, lineHeight: 0.95, color: tone.ink }}>
            Rental
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/invoices">
            <Btn variant="outline">Invoices</Btn>
          </Link>
          <Link href="/buildings">
            <Btn variant="outline">Buildings</Btn>
          </Link>
          <Link href="/rental/renewals">
            <Btn variant="outline">
              Renewals
            </Btn>
          </Link>
          <Link href="/rental/new">
            <Btn variant="primary" icon={<Icons.Plus />}>
              New Rental
            </Btn>
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: tone.paperDeep }}>
          {statuses.map((item) => (
            <button
              key={item.id}
              onClick={() => setStatus(item.id)}
              className="px-3 h-8 rounded-md text-[12.5px] font-medium transition-colors flex items-center gap-2"
              style={{
                background: status === item.id ? tone.card : "transparent",
                color: status === item.id ? tone.ink : tone.ink50,
                boxShadow: status === item.id ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
              }}
            >
              {item.label}
              <span className="text-[11px] font-mono" style={{ color: status === item.id ? tone.ink50 : tone.ink30 }}>
                {item.count}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 h-9 px-3 rounded-md min-w-[320px]" style={{ background: tone.card, border: `1px solid ${tone.line}` }}>
          <span style={{ color: tone.ink30 }}>
            <Icons.Search />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenant, unit, building, agent..."
            className="flex-1 bg-transparent outline-none text-[13px]"
            style={{ color: tone.ink }}
          />
        </div>
      </div>

      <Card>
        <div className="grid text-[11px] uppercase tracking-[0.1em] px-6 py-3" style={{ gridTemplateColumns: "0.7fr 1.9fr 1.2fr 0.9fr 1fr 1.2fr 0.8fr", color: tone.ink50, borderBottom: `1px solid ${tone.lineSoft}` }}>
          <div>Rental #</div>
          <div>Building / Tenant</div>
          <div>Agent</div>
          <div>Move-in</div>
          <div className="text-right">Commission</div>
          <div>Invoice / Payment</div>
          <div className="text-right">Status</div>
        </div>
        {loading ? (
          <div className="px-6 py-12 text-center text-[13px]" style={{ color: tone.ink50 }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            {deals.length === 0 ? (
              <>
                <div className="font-serif mb-2" style={{ fontSize: 24, color: tone.ink }}>
                  No rental deals yet
                </div>
                <Link href="/rental/new" className="text-[13px] underline" style={{ color: tone.accent }}>
                  Create your first rental
                </Link>
              </>
            ) : (
              <p className="text-[13px]" style={{ color: tone.ink50 }}>
                No results match your filters.
              </p>
            )}
          </div>
        ) : (
          filtered.map(({ deal, building, agents, invoiceSummary }, index) => {
            const primary = agents.find((participant) => participant.isPrimary);
            const others = agents.filter((participant) => !participant.isPrimary);
            return (
            <Link
              key={deal.id}
              href={`/rental/${deal.id}`}
              className="grid w-full text-left px-6 py-4 transition-colors items-center hover:bg-[#FAF7F0]"
              style={{
                gridTemplateColumns: "0.7fr 1.9fr 1.2fr 0.9fr 1fr 1.2fr 0.8fr",
                borderBottom: index < filtered.length - 1 ? `1px solid ${tone.lineSoft}` : "none",
              }}
            >
              <div className="font-mono text-[12.5px]" style={{ color: tone.ink }}>
                #{deal.id}
              </div>
              <div>
                <div className="text-[13px]" style={{ color: tone.ink }}>
                  {building?.name || "—"} · Unit {deal.unit}
                </div>
                <div
                  className="text-[11.5px] mt-0.5 flex items-center gap-1.5"
                  style={{ color: tone.ink50 }}
                >
                  <span>{deal.tenantName}</span>
                  {deal.source && (
                    <span title={sourceLabel(deal.source)}>
                      · {sourceEmoji(deal.source)}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[12.5px]" style={{ color: tone.ink70 }}>
                  {primary?.agent?.name || "—"}
                </div>
                {others.length > 0 && (
                  <div className="mt-1">
                    <Pill tone="neutral">
                      +{others.length} agent{others.length === 1 ? "" : "s"}
                    </Pill>
                  </div>
                )}
              </div>
              <div className="text-[12.5px] font-mono" style={{ color: tone.ink70 }}>
                {deal.moveInDate ? fmtDate(deal.moveInDate) : "—"}
              </div>
              <div className="text-right font-serif" style={{ fontSize: 18, color: tone.ink }}>
                ${fmtMoney(Number(deal.totalCommission || 0))}
              </div>
              <div>
                <Pill tone={invoicePaymentTone(invoiceSummary.status)}>
                  {invoiceSummary.label}
                </Pill>
                <div className="mt-1 text-[11.5px]" style={{ color: tone.ink50 }}>
                  {paymentDetail(invoiceSummary)}
                </div>
              </div>
              <div className="text-right">
                <Pill tone={statusTone(deal.status)}>{deal.status}</Pill>
              </div>
            </Link>
            );
          })
        )}
      </Card>
    </div>
  );
}
