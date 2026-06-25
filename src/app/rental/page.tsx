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
import { useLocale } from "@/lib/i18n-client";
import type { Agent, Building, Deal } from "@/db/schema";

const M = {
  en: {
    eyebrow: "Pipeline",
    title: "Rental",
    invoices: "Invoices",
    buildings: "Buildings",
    renewals: "Renewals",
    newRental: "New Rental",
    all: "All",
    active: "Active",
    cancelled: "Cancelled",
    completed: "Completed",
    searchPlaceholder: "Search tenant, unit, building, agent…",
    emptyNoDeals: "No rental deals yet",
    emptyNoResults: "No results match your filters",
    createFirst: "Create your first rental",
    colRental: "Rental #",
    colBuildingTenant: "Building / Tenant",
    colAgent: "Agent",
    colMoveIn: "Move-in",
    colCommission: "Commission",
    colInvoicePayment: "Invoice / Payment",
    colStatus: "Status",
    unit: "Unit",
    agent: "agent",
    agents: "agents",
    outstanding: "outstanding",
    received: "Received",
    receivedAmount: "received",
    draftInvoice: "draft invoice",
    draftInvoices: "draft invoices",
    needsResend: "Needs resend",
    createInvoiceWhenReady: "Create invoice when ready",
  },
  zh: {
    eyebrow: "管道",
    title: "租赁",
    invoices: "发票",
    buildings: "楼盘",
    renewals: "续约",
    newRental: "新建租约",
    all: "全部",
    active: "进行中",
    cancelled: "已取消",
    completed: "已完成",
    searchPlaceholder: "搜索租客、单元、楼盘、经纪人…",
    emptyNoDeals: "暂无租赁交易",
    emptyNoResults: "没有符合筛选条件的结果",
    createFirst: "创建第一笔租约",
    colRental: "租约编号",
    colBuildingTenant: "楼盘 / 租客",
    colAgent: "经纪人",
    colMoveIn: "入住",
    colCommission: "佣金",
    colInvoicePayment: "发票 / 付款",
    colStatus: "状态",
    unit: "单元",
    agent: "位经纪人",
    agents: "位经纪人",
    outstanding: "待付款",
    received: "已收款",
    receivedAmount: "已收款",
    draftInvoice: "张草稿发票",
    draftInvoices: "张草稿发票",
    needsResend: "需重新发送",
    createInvoiceWhenReady: "准备好后创建发票",
  },
} as const;

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

function paymentDetail(summary: InvoicePaymentSummary, t: (typeof M)[keyof typeof M]) {
  if (summary.status === "awaiting_payment") {
    return `$${fmtMoney(summary.totalOutstanding)} ${t.outstanding}`;
  }
  if (summary.status === "paid") {
    return summary.paidAt ? `${t.received} ${fmtDate(summary.paidAt)}` : `$${fmtMoney(summary.totalPaid)} ${t.receivedAmount}`;
  }
  if (summary.status === "draft") {
    return `${summary.invoiceCount} ${summary.invoiceCount === 1 ? t.draftInvoice : t.draftInvoices}`;
  }
  if (summary.status === "failed") {
    return t.needsResend;
  }
  return t.createInvoiceWhenReady;
}

export default function DealsPage() {
  const t = M[useLocale()];
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
      label: t.colRental,
      width: "0.7fr",
      render: (row) => (
        <span className="font-mono text-[12.5px]" style={{ color: tone.ink }}>
          #{row.deal.id}
        </span>
      ),
    },
    {
      key: "building",
      label: t.colBuildingTenant,
      width: "1.9fr",
      render: (row) => (
        <div>
          <div className="text-[13px]" style={{ color: tone.ink }}>
            {row.building?.name || "—"} · {t.unit} {row.deal.unit}
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
      label: t.colAgent,
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
                  +{others.length} {others.length === 1 ? t.agent : t.agents}
                </Pill>
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "moveIn",
      label: t.colMoveIn,
      width: "0.9fr",
      render: (row) => (
        <span className="text-[12.5px] font-mono" style={{ color: tone.ink70 }}>
          {row.deal.moveInDate ? fmtDate(row.deal.moveInDate) : "—"}
        </span>
      ),
    },
    {
      key: "commission",
      label: t.colCommission,
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
      label: t.colInvoicePayment,
      width: "1.2fr",
      render: (row) => (
        <div>
          <Pill tone={invoicePaymentTone(row.invoiceSummary.status)}>
            {row.invoiceSummary.label}
          </Pill>
          <div className="mt-1 text-[11.5px]" style={{ color: tone.ink50 }}>
            {paymentDetail(row.invoiceSummary, t)}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      label: t.colStatus,
      width: "0.8fr",
      align: "right",
      render: (row) => <Pill tone={statusTone(row.deal.status)}>{row.deal.status}</Pill>,
    },
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        actions={
          <>
            <Link href="/invoices">
              <Btn variant="outline">{t.invoices}</Btn>
            </Link>
            <Link href="/buildings">
              <Btn variant="outline">{t.buildings}</Btn>
            </Link>
            <Link href="/rental/renewals">
              <Btn variant="outline">{t.renewals}</Btn>
            </Link>
            <Link href="/rental/new">
              <Btn variant="primary" icon={<Icons.Plus />}>
                {t.newRental}
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
            { id: "all", label: t.all, count: counts.all },
            { id: "active", label: t.active, count: counts.active },
            { id: "cancelled", label: t.cancelled, count: counts.cancelled },
            { id: "completed", label: t.completed, count: counts.completed },
          ]}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t.searchPlaceholder}
          className="min-w-[320px]"
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={filtered}
        getKey={(row) => row.deal.id}
        getHref={(row) => `/rental/${row.deal.id}`}
        loading={loading}
        emptyTitle={deals.length === 0 ? t.emptyNoDeals : t.emptyNoResults}
        emptyAction={
          deals.length === 0 ? (
            <Link href="/rental/new" className="text-[13px] underline" style={{ color: tone.accent }}>
              {t.createFirst}
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}
