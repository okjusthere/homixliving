"use client";

import { useId, useState, type FormEvent } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { tone } from "@/components/homix/tokens";
import {
  parseShareListingFilters,
  SHARE_LISTING_PROPERTY_TYPES,
  type ShareListingFilters,
} from "@/lib/share-listing-filters";

const COPY = {
  en: {
    filters: "Filters", city: "City", cityHint: "Exact city, e.g. Garden City",
    type: "Property type", anyType: "All property types",
    min: "Min price (USD)", max: "Max price (USD)", noMin: "No minimum", noMax: "No maximum",
    beds: "Bedrooms", anyBeds: "Any bedrooms", sort: "Sort by",
    newest: "Newest first", "price-asc": "Price: low to high", "price-desc": "Price: high to low", "beds-desc": "Most bedrooms",
    apply: "Apply filters", reset: "Reset filters", remove: "Remove",
    invalid: "Enter valid prices. Minimum price cannot exceed maximum price.",
    minSummary: "From", maxSummary: "Up to", bedsSuffix: "+ beds",
  },
  zh: {
    filters: "筛选", city: "城市", cityHint: "完整城市名，如 Garden City",
    type: "房屋类型", anyType: "全部房型",
    min: "最低价（美元）", max: "最高价（美元）", noMin: "不限最低价", noMax: "不限最高价",
    beds: "卧室数", anyBeds: "不限卧室", sort: "排序",
    newest: "最新房源", "price-asc": "价格从低到高", "price-desc": "价格从高到低", "beds-desc": "卧室从多到少",
    apply: "应用筛选", reset: "重置筛选", remove: "移除",
    invalid: "请输入有效价格，最低价不能高于最高价。",
    minSummary: "最低", maxSummary: "最高", bedsSuffix: " 间及以上",
  },
} as const;

const TYPE_ZH: Record<(typeof SHARE_LISTING_PROPERTY_TYPES)[number], string> = {
  "Single Family": "独栋住宅 · Single Family",
  Condo: "公寓 · Condo",
  "Co-op": "合作公寓 · Co-op",
  Townhouse: "联排住宅 · Townhouse",
  "Multi-Family": "多家庭住宅 · Multi-Family",
  Land: "土地 · Land",
  Residential: "住宅 · Residential",
};

const priceLabel = (price: number) => `$${price.toLocaleString("en-US")}`;
const fieldClass = "h-11 w-full min-w-0 rounded-md px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-homix-accent";
const fieldStyle = { background: tone.card, color: tone.ink, border: `1px solid ${tone.line}` };

export function ListingFilters({ locale, value, onChange }: {
  locale: "en" | "zh";
  value: ShareListingFilters;
  onChange: (filters: ShareListingFilters) => void;
}) {
  const t = COPY[locale];
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");

  const chips: { key: keyof ShareListingFilters; label: string }[] = [];
  if (value.city) chips.push({ key: "city", label: value.city });
  if (value.propertyType) chips.push({ key: "propertyType", label: locale === "zh" ? TYPE_ZH[value.propertyType] : value.propertyType });
  if (value.minPrice != null && value.minPrice > 0) chips.push({ key: "minPrice", label: `${t.minSummary} ${priceLabel(value.minPrice)}` });
  if (value.maxPrice != null) chips.push({ key: "maxPrice", label: `${t.maxSummary} ${priceLabel(value.maxPrice)}` });
  if (value.beds) chips.push({ key: "beds", label: `${value.beds}${t.bedsSuffix}` });
  if (value.sort && value.sort !== "newest") chips.push({ key: "sort", label: t[value.sort] });

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    new FormData(event.currentTarget).forEach((entry, key) => params.set(key, String(entry)));
    const parsed = parseShareListingFilters(params);
    if (!parsed.ok) {
      setError(t.invalid);
      return;
    }
    setError("");
    onChange(parsed.filters);
    setExpanded(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-md px-3 text-[13px] font-medium sm:hidden"
          style={fieldStyle}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal size={15} aria-hidden />
          {t.filters}{chips.length > 0 ? ` (${chips.length})` : ""}
          <ChevronDown size={14} aria-hidden className={expanded ? "rotate-180" : ""} />
        </button>
        {chips.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full px-3 text-[12px]"
            style={{ background: tone.paperDeep, color: tone.ink70 }}
            aria-label={`${t.remove} ${label}`}
            onClick={() => {
              const next = { ...value };
              delete next[key];
              onChange(next);
            }}
          >
            <span className="truncate">{label}</span><X size={13} aria-hidden className="shrink-0" />
          </button>
        ))}
      </div>
      <form
        id={panelId}
        onSubmit={apply}
        className={`${expanded ? "block" : "hidden"} rounded-lg p-3 sm:block sm:p-4`}
        style={{ background: tone.paperDeep }}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <label className="col-span-2 min-w-0 space-y-1.5 text-[12px] sm:col-span-1" style={{ color: tone.ink70 }}>
            <span className="block">{t.city}</span>
            <input name="city" defaultValue={value.city ?? ""} maxLength={100} placeholder={t.cityHint} className={fieldClass} style={fieldStyle} />
          </label>
          <label className="col-span-2 min-w-0 space-y-1.5 text-[12px] sm:col-span-1" style={{ color: tone.ink70 }}>
            <span className="block">{t.type}</span>
            <select name="propertyType" aria-label={t.type} defaultValue={value.propertyType ?? ""} className={fieldClass} style={fieldStyle}>
              <option value="">{t.anyType}</option>
              {SHARE_LISTING_PROPERTY_TYPES.map((type) => <option key={type} value={type}>{locale === "zh" ? TYPE_ZH[type] : type}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-[12px]" style={{ color: tone.ink70 }}>
            <span className="block">{t.min}</span>
            <input name="minPrice" type="number" inputMode="decimal" min="0" step="any" defaultValue={value.minPrice ?? ""} placeholder={t.noMin} aria-invalid={Boolean(error)} aria-describedby={error ? `${panelId}-error` : undefined} className={fieldClass} style={fieldStyle} />
          </label>
          <label className="min-w-0 space-y-1.5 text-[12px]" style={{ color: tone.ink70 }}>
            <span className="block">{t.max}</span>
            <input name="maxPrice" type="number" inputMode="decimal" min="0" step="any" defaultValue={value.maxPrice ?? ""} placeholder={t.noMax} aria-invalid={Boolean(error)} aria-describedby={error ? `${panelId}-error` : undefined} className={fieldClass} style={fieldStyle} />
          </label>
          <label className="min-w-0 space-y-1.5 text-[12px]" style={{ color: tone.ink70 }}>
            <span className="block">{t.beds}</span>
            <select name="beds" aria-label={t.beds} defaultValue={value.beds ?? ""} className={fieldClass} style={fieldStyle}>
              <option value="">{t.anyBeds}</option>
              {[1, 2, 3, 4, 5].map((beds) => <option key={beds} value={beds}>{beds}{t.bedsSuffix}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-[12px]" style={{ color: tone.ink70 }}>
            <span className="block">{t.sort}</span>
            <select name="sort" aria-label={t.sort} defaultValue={value.sort ?? "newest"} className={fieldClass} style={fieldStyle}>
              {(["newest", "price-asc", "price-desc", "beds-desc"] as const).map((sort) => <option key={sort} value={sort}>{t[sort]}</option>)}
            </select>
          </label>
        </div>
        {error && <p id={`${panelId}-error`} role="alert" className="mt-3 text-[12px]" style={{ color: tone.rose }}>{error}</p>}
        <div className="mt-3 flex items-center justify-end gap-3">
          <button type="button" className="min-h-11 px-3 text-[12px]" style={{ color: tone.ink70 }} onClick={(event) => {
            event.currentTarget.form?.reset();
            setError("");
            onChange({});
          }}>{t.reset}</button>
          <button type="submit" className="min-h-11 rounded-md px-5 text-[13px] font-medium" style={{ background: tone.ink, color: tone.card }}>{t.apply}</button>
        </div>
      </form>
    </div>
  );
}
