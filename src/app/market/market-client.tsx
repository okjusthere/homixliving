"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Btn, Card } from "@/components/homix/primitives";
import { CardHeader, PageHeader } from "@/components/homix/page-kit";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import type { BrokerMarketSummary } from "@/lib/bbo-broker-types";

const M = {
  en: {
    eyebrow: "Agent tools",
    title: "Market overview",
    description: "Current OneKey inventory and recent sales activity for buyer and seller conversations.",
    location: "City or ZIP code",
    locationPlaceholder: "e.g. Flushing or 11354",
    period: "Reporting window",
    propertyType: "Property type",
    days30: "Last 30 days",
    days60: "Last 60 days",
    days90: "Last 90 days",
    allSales: "All for-sale properties",
    residential: "Residential",
    residentialIncome: "Residential income",
    land: "Land",
    search: "Update market",
    loading: "Loading market data…",
    unavailable: "Market data is temporarily unavailable. Please try again.",
    inventory: "Current inventory",
    newListings: "New listings",
    closedListings: "Closed listings",
    medianList: "Median list price",
    medianClose: "Median close price",
    medianCdom: "Median market time",
    saleToList: "Sale-to-list ratio",
    homes: "homes",
    days: "days",
    periodNote: (days: number) => `Based on the last ${days} days`,
    trend: "12-month market trend",
    trendDetail: "New and closed listings by month",
    newShort: "New",
    closedShort: "Closed",
    medianShort: "Median close",
    noTrend: "No monthly activity matches these filters.",
    asOf: "Data updated",
    scopeNote: "Internal broker data. Counts may change as MLS records are corrected.",
  },
  zh: {
    eyebrow: "经纪人工具",
    title: "市场概览",
    description: "查看 OneKey 当前库存与近期成交数据，用于买家和卖家沟通。",
    location: "城市或邮编",
    locationPlaceholder: "例如 Flushing 或 11354",
    period: "统计周期",
    propertyType: "房产类型",
    days30: "最近 30 天",
    days60: "最近 60 天",
    days90: "最近 90 天",
    allSales: "全部在售类型",
    residential: "住宅",
    residentialIncome: "投资住宅",
    land: "土地",
    search: "更新数据",
    loading: "正在加载市场数据…",
    unavailable: "市场数据暂时无法加载，请稍后重试。",
    inventory: "当前库存",
    newListings: "新增房源",
    closedListings: "已成交房源",
    medianList: "挂牌价中位数",
    medianClose: "成交价中位数",
    medianCdom: "市场停留中位数",
    saleToList: "成交挂牌价比",
    homes: "套",
    days: "天",
    periodNote: (days: number) => `按最近 ${days} 天统计`,
    trend: "近 12 个月市场趋势",
    trendDetail: "按月统计新增与成交房源",
    newShort: "新增",
    closedShort: "成交",
    medianShort: "成交价中位数",
    noTrend: "当前筛选条件下暂无月度数据。",
    asOf: "数据更新时间",
    scopeNote: "仅供公司内部使用，MLS 更正记录后数字可能变化。",
  },
} as const;

type MarketFilters = {
  location: string;
  periodDays: string;
  propertyType: string;
};

const DEFAULT_FILTERS: MarketFilters = {
  location: "",
  periodDays: "30",
  propertyType: "",
};

function marketParams(filters: MarketFilters) {
  const params = new URLSearchParams({
    periodDays: filters.periodDays,
    trendMonths: "12",
  });
  const location = filters.location.trim();
  if (location) {
    params.set(/^\d{5}(?:-\d{4})?$/.test(location) ? "postalCode" : "city", location);
  }
  if (filters.propertyType) params.set("propertyType", filters.propertyType);
  return params;
}

function money(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export default function MarketClient() {
  const locale = useLocale();
  const t = M[locale];
  const [filters, setFilters] = useState<MarketFilters>(DEFAULT_FILTERS);
  const [data, setData] = useState<BrokerMarketSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMarket = useCallback(async (nextFilters: MarketFilters) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/market?${marketParams(nextFilters)}`, {
        cache: "no-store",
      });
      const payload = await response.json() as BrokerMarketSummary & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Market request failed");
      setData(payload);
    } catch {
      setData(null);
      setError(M[locale].unavailable);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void loadMarket(DEFAULT_FILTERS);
  }, [loadMarket]);

  const trendRows = useMemo(
    () => [...(data?.trend || [])].sort((a, b) => b.month.localeCompare(a.month)),
    [data],
  );

  const maxTrendCount = useMemo(
    () => Math.max(1, ...trendRows.flatMap((row) => [row.newListings, row.closedListings])),
    [trendRows],
  );

  const metrics = data
    ? [
        { label: t.inventory, value: data.metrics.currentInventory.toLocaleString(), detail: t.homes },
        { label: t.newListings, value: data.metrics.newListings.toLocaleString(), detail: t.periodNote(data.periodDays) },
        { label: t.closedListings, value: data.metrics.closedListings.toLocaleString(), detail: t.periodNote(data.periodDays) },
        { label: t.medianList, value: money(data.metrics.medianListPrice), detail: "" },
        { label: t.medianClose, value: money(data.metrics.medianClosePrice), detail: t.periodNote(data.periodDays) },
        { label: t.medianCdom, value: Math.round(data.metrics.medianCdom).toLocaleString(), detail: t.days },
        { label: t.saleToList, value: `${data.metrics.saleToListRatio.toFixed(1)}%`, detail: t.periodNote(data.periodDays) },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />

      <Card className="p-4 sm:p-5">
        <form
          className="grid min-w-0 gap-3 md:grid-cols-[minmax(220px,1fr)_190px_220px_auto] md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void loadMarket(filters);
          }}
        >
          <label className="min-w-0">
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
              {t.location}
            </span>
            <input
              value={filters.location}
              onChange={(event) => setFilters((current) => ({ ...current, location: event.target.value }))}
              placeholder={t.locationPlaceholder}
              className="h-11 w-full min-w-0 rounded-lg px-3 text-[13.5px] outline-none"
              style={{ border: `1px solid ${tone.line}`, color: tone.ink, background: tone.card }}
            />
          </label>
          <label>
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
              {t.period}
            </span>
            <select
              value={filters.periodDays}
              onChange={(event) => setFilters((current) => ({ ...current, periodDays: event.target.value }))}
              className="h-11 w-full rounded-lg px-3 text-[13.5px] outline-none"
              style={{ border: `1px solid ${tone.line}`, color: tone.ink, background: tone.card }}
            >
              <option value="30">{t.days30}</option>
              <option value="60">{t.days60}</option>
              <option value="90">{t.days90}</option>
            </select>
          </label>
          <label>
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
              {t.propertyType}
            </span>
            <select
              value={filters.propertyType}
              onChange={(event) => setFilters((current) => ({ ...current, propertyType: event.target.value }))}
              className="h-11 w-full rounded-lg px-3 text-[13.5px] outline-none"
              style={{ border: `1px solid ${tone.line}`, color: tone.ink, background: tone.card }}
            >
              <option value="">{t.allSales}</option>
              <option value="Residential">{t.residential}</option>
              <option value="Residential Income">{t.residentialIncome}</option>
              <option value="Land">{t.land}</option>
            </select>
          </label>
          <Btn type="submit" disabled={loading} icon={loading ? <RefreshCw className="size-4 animate-spin" /> : <Search className="size-4" />}>
            {t.search}
          </Btn>
        </form>
      </Card>

      {error ? (
        <Card className="p-6 text-[13px]" style={{ color: tone.rose, background: tone.roseSoft }}>
          {error}
        </Card>
      ) : loading && !data ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-[13px]" style={{ color: tone.ink50 }}>
          <RefreshCw className="size-4 animate-spin" /> {t.loading}
        </div>
      ) : data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <Card key={metric.label} className="min-h-[128px] p-5">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                  {metric.label}
                </div>
                <div className="mt-3 break-words font-serif text-[32px] leading-none" style={{ color: tone.ink }}>
                  {metric.value}
                </div>
                {metric.detail && <div className="mt-2 text-[12px]" style={{ color: tone.ink50 }}>{metric.detail}</div>}
              </Card>
            ))}
          </section>

          <Card className="overflow-hidden">
            <CardHeader title={t.trend} subtitle={t.trendDetail} />
            {trendRows.length === 0 ? (
              <div className="px-5 py-12 text-center text-[13px]" style={{ color: tone.ink50 }}>{t.noTrend}</div>
            ) : (
              <div className="divide-y" style={{ borderColor: tone.lineSoft }}>
                {trendRows.map((row) => (
                  <div key={row.month} className="grid gap-3 px-4 py-4 sm:grid-cols-[90px_minmax(0,1fr)_150px] sm:items-center sm:px-5">
                    <div className="font-mono text-[12px]" style={{ color: tone.ink70 }}>{row.month}</div>
                    <div className="space-y-2">
                      <div className="grid grid-cols-[52px_minmax(0,1fr)_36px] items-center gap-2 text-[11px]" style={{ color: tone.ink50 }}>
                        <span>{t.newShort}</span>
                        <span className="h-2 overflow-hidden rounded-full" style={{ background: tone.paperDeep }}>
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (row.newListings / maxTrendCount) * 100)}%`, background: tone.accent }} />
                        </span>
                        <span className="text-right font-mono">{row.newListings}</span>
                      </div>
                      <div className="grid grid-cols-[52px_minmax(0,1fr)_36px] items-center gap-2 text-[11px]" style={{ color: tone.ink50 }}>
                        <span>{t.closedShort}</span>
                        <span className="h-2 overflow-hidden rounded-full" style={{ background: tone.paperDeep }}>
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (row.closedListings / maxTrendCount) * 100)}%`, background: tone.brand }} />
                        </span>
                        <span className="text-right font-mono">{row.closedListings}</span>
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>{t.medianShort}</div>
                      <div className="mt-1 font-serif text-[18px]" style={{ color: tone.ink }}>
                        {row.medianClosePrice == null ? "—" : money(row.medianClosePrice)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="flex flex-col gap-1 text-[11px] sm:flex-row sm:items-center sm:justify-between" style={{ color: tone.ink50 }}>
            <span>{t.asOf}: {new Date(data.asOf).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}</span>
            <span>{t.scopeNote}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
