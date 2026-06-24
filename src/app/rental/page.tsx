"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Btn, Icons, Pill } from "@/components/homix/primitives";
import {
  PageHeader,
  Toolbar,
  FilterTabs,
  SearchInput,
  DataTable,
  type Column,
} from "@/components/homix/page-kit";
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

  const columns: Column<DealRow>[] = [
    {
      key: "id",
      label: "Rental #",
      width: "0.7fr",
      render: (row) => (
        <span className="font-mono text-[12.5px]" style={{ color: tone.ink }}>
          #{row.deal.id}
        </span>
      ),
    },
    {
      key: "building",
      label: "Building / Tenant",
      width: "1.9fr",
      render: (row) => (
        <div>
          <div className="text-[13px]" style={{ color: tone.ink }}>
            {row.building?.name || "—"} · Unit {row.deal.unit}
          </div>
          <div
            className="text-[11.5px] mt-0.5 flex items-center gap-1.5"
            style={{ color: tone.ink50 }}
          >
            <span>{row.deal.tenantName}</span>
            {row.deal.source && (
              <span title={sourceLabel(row.deal.source)}>
                · {sourceEmoji(row.deal.source)}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "agent",
      label: "Agent",
      width: "1.2fr",
      render: (row) => {
        const primary = row.agents.find((participant) => participant.isPrimary);
        const others = row.agents.filter((participant) => !participant.isPrimary);
        return (
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
        );
      },
    },
    {
      key: "moveIn",
      label: "Move-in",
      width: "0.9fr",
      render: (row) => (
        <span className="text-[12.5px] font-mono" style={{ color: tone.ink70 }}>
          {row.deal.moveInDate ? fmtDate(row.deal.moveInDate) : "—"}
        </span>
      ),
    },
    {
      key: "commission",
      label: "Commission",
      width: "1fr",
      align: "right",
      render: (row) => (
        <div className="font-serif" style={{ fontSize: 18, color: tone.ink }}>
          ${fmtMoney(Number(row.deal.totalCommission || 0))}
        </div>
      ),
    },
    {
      key: "invoice",
      label: "Invoice / Payment",
      width: "1.2fr",
      render: (row) => (
        <div>
          <Pill tone={invoicePaymentTone(row.invoiceSummary.status)}>
            {row.invoiceSummary.label}
          </Pill>
          <div className="mt-1 text-[11.5px]" style={{ color: tone.ink50 }}>
            {paymentDetail(row.invoiceSummary)}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: "0.8fr",
      align: "right",
      render: (row) => <Pill tone={statusTone(row.deal.status)}>{row.deal.status}</Pill>,
    },
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Pipeline"
        title="Rental"
        actions={
          <>
            <Link href="/invoices">
              <Btn variant="outline">Invoices</Btn>
            </Link>
            <Link href="/buildings">
              <Btn variant="outline">Buildings</Btn>
            </Link>
            <Link href="/rental/renewals">
              <Btn variant="outline">Renewals</Btn>
            </Link>
            <Link href="/rental/new">
              <Btn variant="primary" icon={<Icons.Plus />}>
                New Rental
              </Btn>
            </Link>
          </>
        }
      />

      <Toolbar>
        <FilterTabs
          value={status}
          onChange={setStatus}
          options={[
            { id: "all", label: "All", count: counts.all },
            { id: "active", label: "Active", count: counts.active },
            { id: "cancelled", label: "Cancelled", count: counts.cancelled },
            { id: "completed", label: "Completed", count: counts.completed },
          ]}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search tenant, unit, building, agent…"
          className="min-w-[320px]"
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={filtered}
        getKey={(row) => row.deal.id}
        getHref={(row) => `/rental/${row.deal.id}`}
        loading={loading}
        emptyTitle={deals.length === 0 ? "No rental deals yet" : "No results match your filters"}
        emptyAction={
          deals.length === 0 ? (
            <Link href="/rental/new" className="text-[13px] underline" style={{ color: tone.accent }}>
              Create your first rental
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}
