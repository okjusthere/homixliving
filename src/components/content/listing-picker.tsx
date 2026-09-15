"use client";
/* eslint-disable @next/next/no-img-element -- MLS photos originate from the website listing feed. */
import { useEffect, useRef, useState } from "react";
import {
  LoaderCircle,
  RefreshCw,
  Search,
  Check,
  ArrowLeft,
} from "lucide-react";
import type {
  StudioListing,
  StudioListingPage,
} from "@/lib/content/listing-source";
import { contentFetch } from "./ui";

export function ListingPicker({
  zh,
  disabled,
  onChoose,
  onError,
  selection,
}: {
  selection?: { ids: string[]; onToggle: (listing: StudioListing) => void };
  onError: (message: string) => void;
  zh: boolean;
  disabled: boolean;
  onChoose: (listing: StudioListing, photos: string[]) => Promise<void>;
}) {
  const t = (en: string, cn: string) => (zh ? cn : en);
  const [scope, setScope] = useState<"homix" | "all">("homix");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<StudioListingPage | null>(null);
  const [loading, setLoading] = useState(false);
  const setError = onError;
  const [detail, setDetail] = useState<StudioListing | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const requestRevision = revision;
    setData(null);
    setDetail(null);
    revision.current++;
    if (scope === "all" && query.length < 2) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    const params = new URLSearchParams({ scope, q: query, page: String(page) });
    contentFetch<StudioListingPage>(`/api/content/listings?${params}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      requestRevision.current++;
    };
  }, [scope, query, page, refresh, setError]);
  async function open(listing: StudioListing) {
    const current = ++revision.current;
    setSelecting(true);
    setError("");
    setDetail(null);
    try {
      const result = await contentFetch<{ listing: StudioListing }>(
        `/api/content/listings?slug=${encodeURIComponent(listing.slug)}`,
      );
      if (current !== revision.current) return;
      setDetail(result.listing);
      setPhotos(result.listing.photos.slice(0, 1).map((p) => p.url));
    } catch (e) {
      if (current === revision.current)
        setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      if (current === revision.current) setSelecting(false);
    }
  }
  const locked = disabled || selecting;
  if (collapsed)
    return (
      <div className="studio-listing-picker">
        <p className="studio-note">
          {t("Imported", "已导入")}：{selected}
        </p>
        <button
          type="button"
          className="studio-button secondary"
          disabled={locked}
          onClick={() => setCollapsed(false)}
        >
          {t("Choose another listing", "重新选择房源")}
        </button>
      </div>
    );
  return (
    <div className="studio-listing-picker">
      <div
        className="studio-listing-scopes"
        role="group"
        aria-label={t("Listing source", "房源来源")}
      >
        {(
          [
            ["homix", t("Homix listings", "Homix 房源")],
            ["all", t("All MLS listings", "全部 MLS 房源")],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={locked}
            aria-pressed={scope === value}
            onClick={() => {
              setScope(value);
              setDraft("");
              setQuery("");
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="studio-note">
        {scope === "homix"
          ? t(
              "Choose from the official Homix website. Includes company listings across their lifecycle.",
              "直接选择 Homix 官网房源，覆盖公司房源的不同交易状态。",
            )
          : t(
              "Search the wider MLS for buyer transactions or other properties.",
              "搜索全部 MLS，适用于买方交易或其他公司的房源。",
            )}
      </p>
      <form
        className="studio-listing-search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(draft.trim());
          setPage(1);
          setRefresh((v) => v + 1);
        }}
      >
        <input
          aria-label={t("MLS number, address or ZIP", "MLS 编号、地址或邮编")}
          placeholder={t("MLS number, address or ZIP", "MLS 编号、地址或邮编")}
          value={draft}
          maxLength={160}
          onChange={(e) => setDraft(e.target.value)}
          disabled={locked}
        />
        <button
          type="submit"
          className="studio-button secondary"
          disabled={locked || (scope === "all" && draft.trim().length < 2)}
        >
          <Search size={16} />
          {t("Search", "搜索")}
        </button>
        <button
          type="button"
          className="studio-button secondary"
          aria-label={t("Refresh listings", "刷新房源")}
          disabled={locked || loading || (scope === "all" && query.length < 2)}
          onClick={() => setRefresh((v) => v + 1)}
        >
          <RefreshCw size={16} />
        </button>
      </form>
      {loading && (
        <p role="status" className="studio-note">
          <LoaderCircle className="animate-spin" size={16} />
          {t("Loading listings…", "正在加载房源…")}
        </p>
      )}
      {data && !data.listings.length && (
        <p className="studio-note">
          {t(
            "No matching listings. Try another MLS number or address, or enter details below.",
            "未找到匹配房源。可更换 MLS 编号或地址，也可在下方手动填写。",
          )}
        </p>
      )}
      {data && !detail && (
        <>
          <div className="studio-listing-grid">
            {data.listings.map((listing) => (
              <button
                type="button"
                className={`studio-listing-card ${selection?.ids.includes(listing.id) ? "selected" : ""}`}
                aria-pressed={selection ? selection.ids.includes(listing.id) : undefined}
                key={listing.id}
                disabled={locked}
                onClick={() => selection ? selection.onToggle(listing) : open(listing)}
              >
                {listing.photos[0] ? (
                  <img src={listing.photos[0].url} alt="" loading="lazy" />
                ) : (
                  <div className="studio-listing-no-photo">
                    {t("No photo", "暂无照片")}
                  </div>
                )}
                <span className="studio-listing-card-copy">
                  <small>
                    {listing.status} · MLS {listing.mlsNumber}
                  </small>
                  <strong>{selection?.ids.includes(listing.id) && <Check size={18} />} {listing.address.full}</strong>
                  <span>
                    {listing.listPrice
                      ? `$${listing.listPrice.toLocaleString("en-US")}`
                      : ""}{" "}
                    · {listing.beds} {t("bd", "卧")} · {listing.baths}{" "}
                    {t("ba", "卫")}
                  </span>
                  <small>{listing.attribution}</small>
                </span>
              </button>
            ))}
          </div>
          {(page > 1 || data.hasMore) && (
            <div className="studio-listing-pages">
              <button
                type="button"
                className="studio-button secondary"
                disabled={locked || page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t("Previous", "上一页")}
              </button>
              <span>
                {t("Page", "第")} {page} {zh ? "页" : ""}
              </span>
              <button
                type="button"
                className="studio-button secondary"
                disabled={locked || !data.hasMore || page >= 100}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("Next", "下一页")}
              </button>
            </div>
          )}
        </>
      )}
      {(detail || selecting) && (
        <button
          type="button"
          className="studio-back-link"
          disabled={disabled}
          onClick={() => {
            revision.current++;
            setDetail(null);
            setPhotos([]);
            setSelecting(false);
            setError("");
          }}
        >
          <ArrowLeft size={15} />
          {t("Back to listings", "返回房源列表")}
        </button>
      )}
      {selecting && (
        <p role="status" className="studio-note">
          {t(
            "Loading property details / importing photos…",
            "正在加载房源详情／导入照片…",
          )}
        </p>
      )}
      {detail && (
        <div className="studio-listing-detail">
          <strong>{detail.address.full}</strong>
          <p className="studio-note">
            {t(
              "Choose up to 4 photos. Confirm to fill the property details below.",
              "选择最多 4 张照片，确认后自动填入下方房源资料。",
            )}
          </p>
          <div className="studio-source-photos">
            {detail.photos.map((photo, index) => (
              <button
                type="button"
                key={`${photo.url}-${index}`}
                disabled={
                  locked || (!photos.includes(photo.url) && photos.length >= 4)
                }
                aria-pressed={photos.includes(photo.url)}
                aria-label={`${t("Photo", "照片")} ${index + 1}`}
                onClick={() =>
                  setPhotos((p) =>
                    p.includes(photo.url)
                      ? p.filter((u) => u !== photo.url)
                      : [...p, photo.url],
                  )
                }
              >
                <img src={photo.url} alt="" loading="lazy" />
                {photos.includes(photo.url) && <Check size={18} />}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="studio-button"
            disabled={locked}
            onClick={async () => {
              setSelecting(true);
              setError("");
              try {
                await onChoose(detail, photos);
                setSelected(detail.address.full);
                setCollapsed(true);
                setDetail(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Import failed");
              } finally {
                setSelecting(false);
              }
            }}
          >
            {t("Use this listing", "使用此房源")}
          </button>
        </div>
      )}
      {selected && (
        <p role="status" className="studio-note">
          {t("Imported", "已导入")}：{selected}
        </p>
      )}
    </div>
  );
}
