"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Home, RefreshCw, Search } from "lucide-react";
import { Btn, Card, Pill } from "@/components/homix/primitives";
import { PageHeader } from "@/components/homix/page-kit";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import type {
  BrokerExpiredListing,
  BrokerExpiredListingsResponse,
} from "@/lib/bbo-broker-types";

const M = {
  en: {
    eyebrow: "Agent tools",
    title: "Expired listings",
    description: "Broker-only OneKey records for prospecting research. Verify status before any outreach.",
    searchLabel: "Address, ZIP or MLS number",
    searchPlaceholder: "Search expired listings",
    dateFrom: "Expired from",
    dateTo: "Expired through",
    location: "City",
    locationPlaceholder: "Optional city",
    priceMin: "Minimum price",
    priceMax: "Maximum price",
    search: "Search",
    loading: "Loading expired listings…",
    unavailable: "Expired listings are temporarily unavailable. Please try again.",
    empty: "No expired listings match these filters.",
    results: (count: number) => `${count} listing${count === 1 ? "" : "s"} shown`,
    expired: "Expired",
    expiredDate: "Expired date",
    marketTime: "Market time",
    days: "days",
    listedBy: "Previously listed by",
    mls: "MLS",
    beds: "bd",
    baths: "ba",
    loadMore: "Load more",
    internal: "Internal use only. MLS restrictions and fair-housing rules still apply.",
  },
  zh: {
    eyebrow: "经纪人工具",
    title: "已过期房源",
    description: "用于客户开发研究的 OneKey 券商内部数据，联系前请再次确认房源状态。",
    searchLabel: "地址、邮编或 MLS 编号",
    searchPlaceholder: "搜索已过期房源",
    dateFrom: "过期起始日",
    dateTo: "过期截止日",
    location: "城市",
    locationPlaceholder: "可选城市",
    priceMin: "最低挂牌价",
    priceMax: "最高挂牌价",
    search: "查询",
    loading: "正在加载已过期房源…",
    unavailable: "已过期房源暂时无法加载，请稍后重试。",
    empty: "当前筛选条件下没有已过期房源。",
    results: (count: number) => `已显示 ${count} 套房源`,
    expired: "已过期",
    expiredDate: "过期日期",
    marketTime: "市场停留",
    days: "天",
    listedBy: "原挂牌方",
    mls: "MLS",
    beds: "室",
    baths: "卫",
    loadMore: "加载更多",
    internal: "仅限公司内部使用，仍须遵守 MLS 使用限制与公平住房法规。",
  },
} as const;

type ExpiredFilters = {
  q: string;
  city: string;
  dateFrom: string;
  dateTo: string;
  priceMin: string;
  priceMax: string;
};

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultFilters(): ExpiredFilters {
  const through = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return {
    q: "",
    city: "",
    dateFrom: localDateKey(from),
    dateTo: localDateKey(through),
    priceMin: "",
    priceMax: "",
  };
}

function buildParams(filters: ExpiredFilters, cursor?: string) {
  const params = new URLSearchParams({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    limit: "30",
  });
  for (const key of ["q", "city", "priceMin", "priceMax"] as const) {
    if (filters[key].trim()) params.set(key, filters[key].trim());
  }
  if (cursor) params.set("cursor", cursor);
  return params;
}

function money(value?: number) {
  return value == null ? "—" : `$${Math.round(value).toLocaleString("en-US")}`;
}

function displayDate(value: string | undefined, locale: "en" | "zh") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ExpiredListingsClient() {
  const locale = useLocale();
  const t = M[locale];
  const [filters, setFilters] = useState<ExpiredFilters>(() => defaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<ExpiredFilters>(() => defaultFilters());
  const [items, setItems] = useState<BrokerExpiredListing[]>([]);
  const [nextCursor, setNextCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const loadListings = useCallback(async (
    nextFilters: ExpiredFilters,
    options: { cursor?: string; append?: boolean } = {},
  ) => {
    if (options.append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const response = await fetch(
        `/api/expired-listings?${buildParams(nextFilters, options.cursor)}`,
        { cache: "no-store" },
      );
      const payload = await response.json() as BrokerExpiredListingsResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Expired listings request failed");
      setItems((current) => options.append ? [...current, ...payload.items] : payload.items);
      setNextCursor(payload.nextCursor || "");
      setHasMore(payload.hasMore);
      setAppliedFilters(nextFilters);
    } catch {
      if (!options.append) setItems([]);
      setError(M[locale].unavailable);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [locale]);

  useEffect(() => {
    const initial = defaultFilters();
    setFilters(initial);
    void loadListings(initial);
  }, [loadListings]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />

      <Card className="p-4 sm:p-5">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void loadListings(filters);
          }}
        >
          <label className="block min-w-0">
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
              {t.searchLabel}
            </span>
            <div className="flex h-11 min-w-0 items-center gap-2 rounded-lg px-3" style={{ border: `1px solid ${tone.line}`, background: tone.card }}>
              <Search className="size-4 shrink-0" style={{ color: tone.ink30 }} />
              <input
                value={filters.q}
                onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                placeholder={t.searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none"
                style={{ color: tone.ink }}
              />
            </div>
          </label>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5 xl:items-end">
            <FilterField label={t.dateFrom}>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                className="field-control"
                required
              />
            </FilterField>
            <FilterField label={t.dateTo}>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
                className="field-control"
                required
              />
            </FilterField>
            <FilterField label={t.location}>
              <input
                value={filters.city}
                onChange={(event) => setFilters((current) => ({ ...current, city: event.target.value }))}
                placeholder={t.locationPlaceholder}
                className="field-control"
              />
            </FilterField>
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 xl:col-span-1">
              <FilterField label={t.priceMin}>
                <input
                  inputMode="numeric"
                  value={filters.priceMin}
                  onChange={(event) => setFilters((current) => ({ ...current, priceMin: event.target.value.replace(/[^\d.]/g, "") }))}
                  placeholder="$0"
                  className="field-control"
                />
              </FilterField>
              <FilterField label={t.priceMax}>
                <input
                  inputMode="numeric"
                  value={filters.priceMax}
                  onChange={(event) => setFilters((current) => ({ ...current, priceMax: event.target.value.replace(/[^\d.]/g, "") }))}
                  placeholder="—"
                  className="field-control"
                />
              </FilterField>
            </div>
            <Btn type="submit" disabled={loading} icon={loading ? <RefreshCw className="size-4 animate-spin" /> : <Search className="size-4" />}>
              {t.search}
            </Btn>
          </div>
        </form>
      </Card>

      {error ? (
        <Card className="p-6 text-[13px]" style={{ color: tone.rose, background: tone.roseSoft }}>
          {error}
        </Card>
      ) : null}

      <div className="flex flex-col gap-1 text-[11px] sm:flex-row sm:items-center sm:justify-between" style={{ color: tone.ink50 }}>
        <span>{t.results(items.length)}</span>
        <span>{t.internal}</span>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-[13px]" style={{ color: tone.ink50 }}>
          <RefreshCw className="size-4 animate-spin" /> {t.loading}
        </div>
      ) : items.length === 0 && !error ? (
        <Card className="px-5 py-16 text-center font-serif text-[21px]" style={{ color: tone.ink50 }}>
          {t.empty}
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((listing) => (
            <ExpiredListingCard key={listing.listingKey} listing={listing} locale={locale} />
          ))}
        </div>
      )}

      {hasMore && !error ? (
        <div className="flex justify-center">
          <Btn
            variant="outline"
            disabled={loadingMore}
            icon={loadingMore ? <RefreshCw className="size-4 animate-spin" /> : undefined}
            onClick={() => void loadListings(appliedFilters, { cursor: nextCursor, append: true })}
          >
            {t.loadMore}
          </Btn>
        </div>
      ) : null}

      <style jsx>{`
        :global(.field-control) {
          height: 44px;
          width: 100%;
          min-width: 0;
          border: 1px solid ${tone.line};
          border-radius: 8px;
          background: ${tone.card};
          color: ${tone.ink};
          padding: 0 12px;
          font-size: 13.5px;
          outline: none;
        }
      `}</style>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="min-w-0">
      <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function ExpiredListingCard({
  listing,
  locale,
}: {
  listing: BrokerExpiredListing;
  locale: "en" | "zh";
}) {
  const t = M[locale];
  const marketDays = listing.cumulativeDaysOnMarket ?? listing.daysOnMarket;
  const facts = [
    listing.bedroomsTotal != null ? `${listing.bedroomsTotal} ${t.beds}` : "",
    listing.bathroomsTotalInteger != null ? `${listing.bathroomsTotalInteger} ${t.baths}` : "",
    listing.livingArea != null ? `${Math.round(listing.livingArea).toLocaleString()} sf` : "",
  ].filter(Boolean);

  return (
    <Card className="overflow-hidden">
      <div className="grid min-w-0 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="relative aspect-[16/9] overflow-hidden sm:aspect-auto sm:min-h-[230px]" style={{ background: tone.paperDeep }}>
          {listing.thumbnailUrl ? (
            // BBO returns a size-limited OneKey media proxy URL. A native image
            // avoids spending Vercel image-optimization quota on internal data.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.thumbnailUrl}
              alt={listing.unparsedAddress || listing.listingId || "Expired listing"}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full min-h-44 items-center justify-center" style={{ color: tone.ink30 }}>
              <Home className="size-8" strokeWidth={1.3} />
            </div>
          )}
          <div className="absolute left-3 top-3">
            <Pill tone="failed">{t.expired}</Pill>
          </div>
        </div>

        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words font-serif text-[23px] leading-tight" style={{ color: tone.ink }}>
                {listing.unparsedAddress || listing.listingId || listing.listingKey}
              </h2>
              <div className="mt-1 text-[12px]" style={{ color: tone.ink50 }}>
                {[listing.city, listing.stateOrProvince, listing.postalCode].filter(Boolean).join(", ")}
              </div>
            </div>
            <div className="shrink-0 text-right font-serif text-[21px]" style={{ color: tone.ink }}>
              {money(listing.listPrice)}
            </div>
          </div>

          {facts.length > 0 ? (
            <div className="mt-3 text-[12px]" style={{ color: tone.ink70 }}>{facts.join(" · ")}</div>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
            <Detail label={t.expiredDate} value={displayDate(listing.expiredAt, locale)} icon={<CalendarDays className="size-3.5" />} />
            <Detail label={t.marketTime} value={marketDays == null ? "—" : `${marketDays} ${t.days}`} />
            <Detail label={t.mls} value={listing.listingId || "—"} />
            <Detail label={t.listedBy} value={listing.listOfficeName || listing.listAgentFullName || "—"} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function Detail({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: tone.ink50 }}>
        {icon}{label}
      </div>
      <div className="mt-1 break-words text-[12.5px]" style={{ color: tone.ink }}>{value}</div>
    </div>
  );
}
