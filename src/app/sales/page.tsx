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
import { saleRepresentationLabel, saleStageLabel } from "@/lib/sales";
import type { Agent, SaleDeal } from "@/db/schema";
import { useLocale } from "@/lib/i18n-client";

const M = {
  en: {
    eyebrow: "Buy / Sell",
    title: "Sales",
    newSale: "New Sale",
    all: "All",
    active: "Active",
    cancelled: "Cancelled",
    completed: "Completed",
    searchPlaceholder: "Search address, parties, MLS, agent…",
    colSale: "Sale #",
    colProperty: "Property / Parties",
    colType: "Type",
    colAgent: "Agent",
    colClosing: "Closing",
    colCommission: "Commission",
    colStatus: "Status",
    buyer: "Buyer",
    seller: "Seller",
    partiesPending: "Parties pending",
    agent: "agent",
    agents: "agents",
    noSalesYet: "No sales yet",
    noResults: "No results match your filters",
    createFirst: "Create your first sale",
  },
  zh: {
    eyebrow: "买卖",
    title: "买卖",
    newSale: "新建交易",
    all: "全部",
    active: "进行中",
    cancelled: "已取消",
    completed: "已完成",
    searchPlaceholder: "搜索地址、相关方、MLS、经纪人…",
    colSale: "交易编号",
    colProperty: "房产 / 相关方",
    colType: "类型",
    colAgent: "经纪人",
    colClosing: "过户",
    colCommission: "佣金",
    colStatus: "状态",
    buyer: "买家",
    seller: "卖家",
    partiesPending: "相关方待定",
    agent: "位经纪人",
    agents: "位经纪人",
    noSalesYet: "暂无交易",
    noResults: "没有符合筛选条件的结果",
    createFirst: "创建第一笔交易",
  },
} as const;

type SaleRow = {
  saleDeal: SaleDeal;
  agents: Array<{ agent: Agent | null; sharePct: number; isPrimary: boolean }>;
  primaryAgent: Agent | null;
};

function statusTone(status: string) {
  if (status === "completed") return "sent";
  if (status === "cancelled") return "failed";
  return "accent";
}

export default function SalesPage() {
  const t = M[useLocale()];
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "cancelled" | "completed">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sales")
      .then((r) => r.json())
      .then((data) => {
        setSales(data);
        setLoading(false);
      });
  }, []);

  const counts = useMemo(() => {
    const c = { all: sales.length, active: 0, cancelled: 0, completed: 0 };
    for (const row of sales) {
      const s = row.saleDeal.status as keyof typeof c;
      if (s in c) c[s]++;
    }
    return c;
  }, [sales]);

  const filtered = useMemo(() => {
    return sales.filter((row) => {
      const saleDeal = row.saleDeal;
      if (status !== "all" && saleDeal.status !== status) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        saleDeal.propertyAddress.toLowerCase().includes(q) ||
        (saleDeal.buyerNames || "").toLowerCase().includes(q) ||
        (saleDeal.sellerNames || "").toLowerCase().includes(q) ||
        (saleDeal.mlsNumber || "").toLowerCase().includes(q) ||
        row.agents.some((p) => (p.agent?.name || "").toLowerCase().includes(q))
      );
    });
  }, [sales, search, status]);

  const columns: Column<SaleRow>[] = [
    {
      key: "id",
      label: t.colSale,
      width: "0.7fr",
      render: (row) => (
        <span className="font-mono text-[12.5px]" style={{ color: tone.ink }}>
          #{row.saleDeal.id}
        </span>
      ),
    },
    {
      key: "property",
      label: t.colProperty,
      width: "2.2fr",
      render: (row) => {
        const { saleDeal } = row;
        const location = [saleDeal.city, saleDeal.state, saleDeal.zip].filter(Boolean).join(", ");
        return (
          <div>
            <div className="text-[13px]" style={{ color: tone.ink }}>
              {saleDeal.propertyAddress}
            </div>
            <div className="mt-0.5 text-[11.5px]" style={{ color: tone.ink50 }}>
              {[
                saleDeal.buyerNames && `${t.buyer}: ${saleDeal.buyerNames}`,
                saleDeal.sellerNames && `${t.seller}: ${saleDeal.sellerNames}`,
                location,
              ]
                .filter(Boolean)
                .join(" · ") || t.partiesPending}
            </div>
          </div>
        );
      },
    },
    {
      key: "type",
      label: t.colType,
      width: "1.2fr",
      render: (row) => (
        <div>
          <div className="text-[12.5px]" style={{ color: tone.ink70 }}>
            {saleRepresentationLabel(row.saleDeal.representationType)}
          </div>
          <div className="mt-1">
            <Pill tone="neutral">{saleStageLabel(row.saleDeal.stage)}</Pill>
          </div>
        </div>
      ),
    },
    {
      key: "agent",
      label: t.colAgent,
      width: "1.2fr",
      render: (row) => {
        const others = row.agents.filter((p) => !p.isPrimary);
        return (
          <div>
            <div className="text-[12.5px]" style={{ color: tone.ink70 }}>
              {row.primaryAgent?.name || "—"}
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
      key: "closing",
      label: t.colClosing,
      width: "1fr",
      render: (row) => (
        <span className="font-mono text-[12.5px]" style={{ color: tone.ink70 }}>
          {row.saleDeal.closingDate ? fmtDate(row.saleDeal.closingDate) : "—"}
        </span>
      ),
    },
    {
      key: "commission",
      label: t.colCommission,
      width: "1.1fr",
      align: "right",
      render: (row) => (
        <div>
          <div className="font-serif" style={{ fontSize: 18, color: tone.ink }}>
            ${fmtMoney(Number(row.saleDeal.grossCommission || 0))}
          </div>
          {row.saleDeal.purchasePrice ? (
            <div className="font-mono text-[11px]" style={{ color: tone.ink50 }}>
              ${fmtMoney(Number(row.saleDeal.purchasePrice))}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      label: t.colStatus,
      width: "0.8fr",
      align: "right",
      render: (row) => <Pill tone={statusTone(row.saleDeal.status)}>{row.saleDeal.status}</Pill>,
    },
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        actions={
          <Link href="/sales/new">
            <Btn variant="primary" icon={<Icons.Plus />}>
              {t.newSale}
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
            { id: "active", label: t.active, count: counts.active },
            { id: "cancelled", label: t.cancelled, count: counts.cancelled },
            { id: "completed", label: t.completed, count: counts.completed },
          ]}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t.searchPlaceholder}
          className="min-w-[340px]"
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={filtered}
        getKey={(row) => row.saleDeal.id}
        getHref={(row) => `/sales/${row.saleDeal.id}`}
        loading={loading}
        emptyTitle={sales.length === 0 ? t.noSalesYet : t.noResults}
        emptyAction={
          sales.length === 0 ? (
            <Link href="/sales/new" className="text-[13px] underline" style={{ color: tone.accent }}>
              {t.createFirst}
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}
