"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pill } from "@/components/homix/primitives";
import {
  PageHeader,
  Toolbar,
  FilterTabs,
  DataTable,
  type Column,
} from "@/components/homix/page-kit";
import { fmtDate, fmtMoney, tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import {
  RENEWAL_WINDOWS,
  renewalStatusLabel,
  renewalStatusTone,
  windowLabel,
  windowTone,
  type RenewalWindow,
} from "@/lib/renewals";

const M = {
  en: {
    eyebrow: "Rental pipeline",
    title: "Renewals",
    description: (n: number, rent: string) =>
      `${n} lease${
        n === 1 ? "" : "s"
      } ending in the next 90 days · $${rent} monthly rent in play`,
    all: "All",
    statusPending: "Pending",
    statusRenewing: "Renewing",
    statusMovingOut: "Moving out",
    statusRenewed: "Renewed",
    statusLost: "Lost",
    colRental: "Rental",
    unit: "Unit",
    colBuildingTenant: "Building / Tenant",
    colAgent: "Agent",
    colLeaseEnds: "Lease ends",
    colWhen: "When",
    colAction: "Action",
    dAgo: "d ago",
    d: "d",
    reset: "reset",
    statusUpdated: "Status updated",
    updateFailed: "Update failed",
    emptyNothing: "Nothing coming up",
    emptyNoLeases: "No leases in this window",
  },
  zh: {
    eyebrow: "租赁管道",
    title: "续约",
    description: (n: number, rent: string) =>
      `未来 90 天内有 ${n} 份租约到期 · 涉及月租金 $${rent}`,
    all: "全部",
    statusPending: "待处理",
    statusRenewing: "续约中",
    statusMovingOut: "搬离中",
    statusRenewed: "已续约",
    statusLost: "已流失",
    colRental: "租赁",
    unit: "单元",
    colBuildingTenant: "楼盘 / 租客",
    colAgent: "经纪人",
    colLeaseEnds: "租约到期",
    colWhen: "时间",
    colAction: "操作",
    dAgo: "天前",
    d: "天",
    reset: "重置",
    statusUpdated: "状态已更新",
    updateFailed: "更新失败",
    emptyNothing: "暂无即将到期",
    emptyNoLeases: "此时间段没有租约",
  },
} as const;

type RenewalRow = {
  deal: {
    id: number;
    unit: string;
    tenantName: string;
    tenantEmail: string | null;
    tenantPhone: string | null;
    rentAmount: number | null;
    leaseEndDate: string;
    totalCommission: number;
    renewalStatus: string | null;
    renewalNotedAt: string | null;
  };
  buildingName: string | null;
  buildingRegion: string | null;
  agentName: string | null;
  agentEmail: string | null;
  agentPhone: string | null;
  daysUntil: number | null;
  window: RenewalWindow | null;
};

export default function RenewalsPage() {
  const t = M[useLocale()];
  const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "pending", label: t.statusPending },
    { value: "renewing", label: t.statusRenewing },
    { value: "moving_out", label: t.statusMovingOut },
    { value: "renewed", label: t.statusRenewed },
    { value: "lost", label: t.statusLost },
  ];
  const [items, setItems] = useState<RenewalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeWindow, setActiveWindow] = useState<RenewalWindow | "all">("all");
  const [savingDeal, setSavingDeal] = useState<number | null>(null);

  const fetchItems = async () => {
    const res = await fetch("/api/rental/upcoming-renewals");
    const data = await res.json();
    setItems(data.items);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const counts = useMemo(() => {
    const c: Record<RenewalWindow | "all", number> = {
      all: items.length,
      overdue: 0,
      "30": 0,
      "60": 0,
      "90": 0,
    };
    for (const row of items) {
      if (row.window && row.window in c) {
        c[row.window]++;
      }
    }
    return c;
  }, [items]);

  const totalRent = useMemo(
    () => items.reduce((sum, r) => sum + Number(r.deal.rentAmount || 0), 0),
    [items]
  );

  const filtered = useMemo(() => {
    if (activeWindow === "all") return items;
    return items.filter((r) => r.window === activeWindow);
  }, [items, activeWindow]);

  const handleSetStatus = async (dealId: number, renewalStatus: string) => {
    setSavingDeal(dealId);
    try {
      const res = await fetch(`/api/rental/${dealId}/renewal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renewalStatus }),
      });
      if (!res.ok) throw new Error();
      toast.success(t.statusUpdated);
      await fetchItems();
    } catch {
      toast.error(t.updateFailed);
    } finally {
      setSavingDeal(null);
    }
  };

  const columns: Column<RenewalRow>[] = [
    {
      key: "rental",
      label: t.colRental,
      width: "1.4fr",
      render: (row) => (
        <div>
          <span className="font-mono text-[12.5px]" style={{ color: tone.ink }}>
            #{row.deal.id}
          </span>
          <div className="mt-0.5 text-[11.5px]" style={{ color: tone.ink50 }}>
            {t.unit} {row.deal.unit}
          </div>
        </div>
      ),
    },
    {
      key: "building",
      label: t.colBuildingTenant,
      width: "1.6fr",
      render: (row) => (
        <div>
          <div className="text-[13px]" style={{ color: tone.ink }}>
            {row.buildingName || "—"}
          </div>
          <div className="mt-0.5 text-[11.5px]" style={{ color: tone.ink50 }}>
            {row.deal.tenantName}
            {row.deal.rentAmount
              ? ` · $${fmtMoney(Number(row.deal.rentAmount))} / mo`
              : ""}
          </div>
        </div>
      ),
    },
    {
      key: "agent",
      label: t.colAgent,
      width: "1fr",
      render: (row) => (
        <span className="text-[12.5px]" style={{ color: tone.ink70 }}>
          {row.agentName || "—"}
        </span>
      ),
    },
    {
      key: "leaseEnds",
      label: t.colLeaseEnds,
      width: "0.9fr",
      render: (row) => (
        <span className="font-mono text-[12.5px]" style={{ color: tone.ink70 }}>
          {fmtDate(row.deal.leaseEndDate)}
        </span>
      ),
    },
    {
      key: "when",
      label: t.colWhen,
      width: "1fr",
      render: (row) => {
        const days = row.daysUntil;
        const win = row.window;
        return win ? (
          <Pill tone={windowTone(win)}>
            {days !== null && days < 0
              ? `${Math.abs(days)} ${t.dAgo}`
              : `${days} ${t.d}`}
          </Pill>
        ) : null;
      },
    },
    {
      key: "action",
      label: t.colAction,
      width: "1.2fr",
      align: "right",
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          {row.deal.renewalStatus && row.deal.renewalStatus !== "pending" ? (
            <Pill tone={renewalStatusTone(row.deal.renewalStatus)}>
              {renewalStatusLabel(row.deal.renewalStatus)}
            </Pill>
          ) : (
            <select
              value={row.deal.renewalStatus || "pending"}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => handleSetStatus(row.deal.id, e.target.value)}
              disabled={savingDeal === row.deal.id}
              className="h-8 rounded-md px-2 text-[12px] font-medium"
              style={{
                background: tone.paperDeep,
                color: tone.ink,
                border: `1px solid ${tone.line}`,
              }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          {row.deal.renewalStatus && row.deal.renewalStatus !== "pending" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSetStatus(row.deal.id, "pending");
              }}
              disabled={savingDeal === row.deal.id}
              className="text-[11px] underline"
              style={{ color: tone.ink50 }}
            >
              {t.reset}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description(items.length, fmtMoney(totalRent))}
      />

      <Toolbar>
        <FilterTabs
          value={activeWindow}
          onChange={setActiveWindow}
          options={(["all", ...RENEWAL_WINDOWS] as const).map((w) => ({
            id: w,
            label: w === "all" ? t.all : windowLabel(w),
            count: counts[w],
          }))}
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={filtered}
        getKey={(row) => row.deal.id}
        getHref={(row) => `/rental/${row.deal.id}`}
        loading={loading}
        emptyTitle={
          items.length === 0 ? t.emptyNothing : t.emptyNoLeases
        }
      />
    </div>
  );
}
