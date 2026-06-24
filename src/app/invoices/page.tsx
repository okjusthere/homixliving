"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Pill, Btn, Icons } from "@/components/homix/primitives";
import {
  PageHeader,
  Toolbar,
  FilterTabs,
  SearchInput,
  DataTable,
  type Column,
} from "@/components/homix/page-kit";
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

  const columns: Column<InvoiceRow>[] = [
    {
      key: "invoice",
      label: "Invoice",
      width: "1.5fr",
      render: ({ invoice }) => (
        <div>
          <div className="font-mono text-[12.5px]" style={{ color: tone.ink }}>
            {invoice.invoiceNumber}
          </div>
          <div className="text-[11.5px] mt-0.5" style={{ color: tone.ink50 }}>
            Unit {invoice.unit}
          </div>
        </div>
      ),
    },
    {
      key: "building",
      label: "Building / Tenant",
      width: "2fr",
      render: ({ invoice, buildingName }) => (
        <div>
          <div className="text-[13px]" style={{ color: tone.ink }}>
            {buildingName || "—"}
          </div>
          <div className="text-[11.5px] mt-0.5" style={{ color: tone.ink50 }}>
            {invoice.tenantName}
          </div>
        </div>
      ),
    },
    {
      key: "agent",
      label: "Agent",
      width: "1fr",
      render: ({ invoice }) => (
        <div className="text-[12.5px]" style={{ color: tone.ink70 }}>
          {invoice.agentName || "—"}
        </div>
      ),
    },
    {
      key: "issued",
      label: "Issued",
      width: "1fr",
      render: ({ invoice }) => (
        <div className="text-[12.5px] font-mono" style={{ color: tone.ink70 }}>
          {invoice.createdAt ? fmtDate(invoice.createdAt) : "—"}
        </div>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      width: "1fr",
      align: "right",
      render: ({ invoice }) => (
        <div className="font-serif" style={{ fontSize: 18, color: tone.ink, letterSpacing: "-0.01em" }}>
          ${fmtMoney(invoice.totalAmount)}
        </div>
      ),
    },
    {
      key: "payment",
      label: "Payment",
      width: "0.6fr",
      align: "right",
      render: ({ invoice }) => (
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
            ? "Awaiting payment"
            : invoice.status === "failed"
            ? "Failed"
            : "Draft"}
        </Pill>
      ),
    },
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Documents"
        title="Invoices"
        actions={
          <Link href="/invoices/new">
            <Btn variant="primary" icon={<Icons.Plus />}>
              New Invoice
            </Btn>
          </Link>
        }
      />

      <Toolbar>
        <FilterTabs
          value={status}
          onChange={setStatus}
          options={[
            { id: "all", label: "All", count: counts.all },
            { id: "draft", label: "Draft", count: counts.draft },
            { id: "sent", label: "Awaiting", count: counts.sent },
            { id: "paid", label: "Paid", count: counts.paid },
            { id: "failed", label: "Failed", count: counts.failed },
          ]}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by number, tenant, building…"
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={filtered}
        getKey={(row) => row.invoice.id}
        getHref={(row) => `/invoices/${row.invoice.id}`}
        loading={loading}
        emptyTitle={invoices.length === 0 ? "No invoices yet" : "No results match your filters"}
        emptyAction={
          invoices.length === 0 ? (
            <Link href="/invoices/new" className="text-[13px] underline" style={{ color: tone.accent }}>
              Create your first invoice
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}
