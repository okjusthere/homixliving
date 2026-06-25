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
import { useLocale } from "@/lib/i18n-client";

const M = {
  en: {
    eyebrow: "Documents",
    title: "Invoices",
    newInvoice: "New Invoice",
    colInvoice: "Invoice",
    unit: "Unit",
    colBuildingTenant: "Building / Tenant",
    colAgent: "Agent",
    colIssued: "Issued",
    colAmount: "Amount",
    colPayment: "Payment",
    paid: "Paid",
    awaitingPayment: "Awaiting payment",
    failed: "Failed",
    draft: "Draft",
    all: "All",
    sent: "Awaiting",
    searchPlaceholder: "Search by number, tenant, building…",
    emptyNone: "No invoices yet",
    emptyNoResults: "No results match your filters",
    createFirst: "Create your first invoice",
  },
  zh: {
    eyebrow: "文档",
    title: "发票",
    newInvoice: "新建发票",
    colInvoice: "发票",
    unit: "单元",
    colBuildingTenant: "楼盘 / 租客",
    colAgent: "经纪人",
    colIssued: "开具日期",
    colAmount: "金额",
    colPayment: "付款",
    paid: "已付款",
    awaitingPayment: "待付款",
    failed: "失败",
    draft: "草稿",
    all: "全部",
    sent: "待付款",
    searchPlaceholder: "按编号、租客、楼盘搜索…",
    emptyNone: "还没有发票",
    emptyNoResults: "没有符合条件的发票",
    createFirst: "创建第一张发票",
  },
} as const;

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
  const t = M[useLocale()];

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
      label: t.colInvoice,
      width: "1.5fr",
      render: ({ invoice }) => (
        <div>
          <div className="font-mono text-[12.5px]" style={{ color: tone.ink }}>
            {invoice.invoiceNumber}
          </div>
          <div className="text-[11.5px] mt-0.5" style={{ color: tone.ink50 }}>
            {t.unit} {invoice.unit}
          </div>
        </div>
      ),
    },
    {
      key: "building",
      label: t.colBuildingTenant,
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
      label: t.colAgent,
      width: "1fr",
      render: ({ invoice }) => (
        <div className="text-[12.5px]" style={{ color: tone.ink70 }}>
          {invoice.agentName || "—"}
        </div>
      ),
    },
    {
      key: "issued",
      label: t.colIssued,
      width: "1fr",
      render: ({ invoice }) => (
        <div className="text-[12.5px] font-mono" style={{ color: tone.ink70 }}>
          {invoice.createdAt ? fmtDate(invoice.createdAt) : "—"}
        </div>
      ),
    },
    {
      key: "amount",
      label: t.colAmount,
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
      label: t.colPayment,
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
            ? t.paid
            : invoice.status === "sent"
            ? t.awaitingPayment
            : invoice.status === "failed"
            ? t.failed
            : t.draft}
        </Pill>
      ),
    },
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        actions={
          <Link href="/invoices/new">
            <Btn variant="primary" icon={<Icons.Plus />}>
              {t.newInvoice}
            </Btn>
          </Link>
        }
      />

      <Toolbar>
        <FilterTabs
          value={status}
          onChange={setStatus}
          options={[
            { id: "all", label: t.all, count: counts.all },
            { id: "draft", label: t.draft, count: counts.draft },
            { id: "sent", label: t.sent, count: counts.sent },
            { id: "paid", label: t.paid, count: counts.paid },
            { id: "failed", label: t.failed, count: counts.failed },
          ]}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t.searchPlaceholder}
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={filtered}
        getKey={(row) => row.invoice.id}
        getHref={(row) => `/invoices/${row.invoice.id}`}
        loading={loading}
        emptyTitle={invoices.length === 0 ? t.emptyNone : t.emptyNoResults}
        emptyAction={
          invoices.length === 0 ? (
            <Link href="/invoices/new" className="text-[13px] underline" style={{ color: tone.accent }}>
              {t.createFirst}
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}
