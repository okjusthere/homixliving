"use client";

/* Catalog thumbnails come from Homix Web and the MLS provider, so their hosts
   are intentionally dynamic rather than enumerated in next/image config. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Link2,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Share2,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ShareCatalogItem,
  ShareCatalogResult,
  ShareContentKind,
} from "@/lib/homixweb";
import type {
  ShareInquiryDetail,
  ShareLinkSummary,
} from "@/lib/share-center";
import { tone } from "@/components/homix/tokens";
import { Card } from "@/components/homix/server-primitives";

type CatalogKind = ShareContentKind | "all";
type ViewMode = "library" | "analytics";
type LinkScope = "mine" | "all";
type ListingScope = "homix" | "all";

const COPY = {
  en: {
    library: "Content",
    analytics: "Analytics",
    search: "Search guides, neighborhoods, developments…",
    listingSearch: "Search by address, ZIP code, or MLS number…",
    listingSource: "Listing source",
    allOneKey: "All OneKey listings",
    homixOnly: "Homix listings",
    all: "All",
    listing: "Listings",
    neighborhood: "Neighborhoods",
    community: "Communities",
    development: "New developments",
    market: "Market data",
    guide: "Guides & articles",
    news: "News",
    browseCategory: "Content category",
    browseAll: "Browse all",
    searchResults: "Search results",
    results: "items",
    create: "Create my link",
    openLink: "Open share link",
    profileNeeded: "Publish your public profile before sharing",
    profileNeededBody:
      "Shared pages introduce you to the visitor, so your public profile must be visible and include your own headshot.",
    editProfile: "Open public profile",
    sharingAs: "Sharing as",
    sharingAsBody: "This name and headshot appear on every personal share card.",
    checkIdentity: "Check profile",
    empty: "No matching content.",
    unavailable: "Homix Web content is temporarily unavailable.",
    previous: "Previous",
    next: "Next",
    mine: "My links",
    company: "Company",
    links: "Active links",
    views: "Page views",
    visitors: "Unique visitors",
    inquiries: "Inquiries",
    inquiryDetails: "Inquiry details",
    inquiryEmpty: "No inquiries have been submitted through this link.",
    inquiryLoadError: "Unable to load inquiry details.",
    submitted: "Submitted",
    sourcePage: "Source page",
    emailDelivery: "Email delivery",
    deliverySent: "Sent",
    deliveryFailed: "Failed",
    deliveryStored: "Saved",
    noMessage: "No message was provided.",
    noLinks: "No share links yet. Create one from the content library.",
    averageTime: "Avg. engaged",
    medianTime: "Median engaged",
    scroll: "Avg. scroll",
    contacts: "Contact clicks",
    lastVisit: "Last visit",
    never: "Not viewed yet",
    shareTitle: "Your personal share link",
    shareBody:
      "The visitor sees your contact card above the original Homix content.",
    copy: "Copy link",
    copied: "Copied",
    share: "Share",
    preview: "Preview page",
    qrCode: "QR code",
    downloadQr: "Download QR",
    close: "Close",
    stop: "Disable link",
    enable: "Enable link",
    createdFor: "Shared by",
    disabled: "Disabled",
    loadLinksError: "Unable to load share links.",
    createError: "Unable to create the share link.",
    updateError: "Unable to update the share link.",
    chinese: "Chinese",
    english: "English",
  },
  zh: {
    library: "内容库",
    analytics: "分享数据",
    search: "搜索指南、社区、楼盘或新闻…",
    listingSearch: "按地址、邮编或 MLS 编号搜索…",
    listingSource: "房源范围",
    allOneKey: "全部 OneKey 房源",
    homixOnly: "Homix 房源",
    all: "全部",
    listing: "房源",
    neighborhood: "区域指南",
    community: "封闭社区",
    development: "纽约新盘",
    market: "市场数据",
    guide: "指南与文章",
    news: "地产新闻",
    browseCategory: "内容分类",
    browseAll: "查看全部",
    searchResults: "搜索结果",
    results: "项内容",
    create: "生成我的分享链接",
    openLink: "打开专属链接",
    profileNeeded: "先公开个人主页，才能使用分享中心",
    profileNeededBody:
      "分享页会向访客介绍你，因此需要先公开 Homix 对外主页并上传自己的头像。",
    editProfile: "前往个人主页",
    sharingAs: "当前分享身份",
    sharingAsBody: "每一张个人分享卡都会使用这里的姓名和头像。",
    checkIdentity: "检查个人主页",
    empty: "没有符合条件的内容。",
    unavailable: "暂时无法读取 Homix Web 内容。",
    previous: "上一页",
    next: "下一页",
    mine: "我的链接",
    company: "全公司",
    links: "有效链接",
    views: "浏览次数",
    visitors: "独立访客",
    inquiries: "咨询提交",
    inquiryDetails: "咨询明细",
    inquiryEmpty: "这个分享链接还没有收到咨询。",
    inquiryLoadError: "暂时无法读取咨询明细。",
    submitted: "提交时间",
    sourcePage: "来源页面",
    emailDelivery: "邮件通知",
    deliverySent: "已发送",
    deliveryFailed: "发送失败",
    deliveryStored: "已保存",
    noMessage: "访客没有填写留言。",
    noLinks: "还没有分享链接，请先从内容库选择一项内容。",
    averageTime: "平均有效停留",
    medianTime: "中位有效停留",
    scroll: "平均阅读深度",
    contacts: "联系按钮",
    lastVisit: "最近访问",
    never: "还没有人看过",
    shareTitle: "你的个人分享链接",
    shareBody: "访客会先看到你的联系方式，再阅读 Homix 网站上的原始内容。",
    copy: "复制链接",
    copied: "已复制",
    share: "分享到微信",
    preview: "预览页面",
    qrCode: "二维码",
    downloadQr: "下载二维码",
    close: "关闭",
    stop: "停用链接",
    enable: "重新启用",
    createdFor: "分享经纪人",
    disabled: "已停用",
    loadLinksError: "暂时无法读取分享链接。",
    createError: "暂时无法生成分享链接。",
    updateError: "暂时无法更新分享链接。",
    chinese: "中文",
    english: "English",
  },
} as const;

const KINDS: CatalogKind[] = [
  "all",
  "listing",
  "neighborhood",
  "community",
  "development",
  "market",
  "guide",
  "news",
];

const OVERVIEW_KINDS: ShareContentKind[] = [
  "neighborhood",
  "community",
  "development",
  "market",
  "guide",
  "news",
];

function formatDuration(seconds: number, locale: "en" | "zh"): string {
  if (seconds < 60) return locale === "zh" ? `${seconds} 秒` : `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (locale === "zh") {
    return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分`;
  }
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function linkKey(
  item: Pick<ShareCatalogItem, "kind" | "key">,
  locale: "en" | "zh",
) {
  return `${item.kind}:${item.key}:${locale}`;
}

function CatalogCard({
  item,
  label,
  existing,
  busy,
  canShare,
  createLabel,
  openLabel,
  onActivate,
}: {
  item: ShareCatalogItem;
  label: string;
  existing: ShareLinkSummary | undefined;
  busy: boolean;
  canShare: boolean;
  createLabel: string;
  openLabel: string;
  onActivate: () => void;
}) {
  return (
    <article
      className="grid min-h-[132px] grid-cols-[112px_minmax(0,1fr)] overflow-hidden rounded-lg sm:flex sm:min-h-[330px] sm:flex-col"
      style={{ background: tone.card, border: `1px solid ${tone.line}` }}
    >
      <div
        className="relative min-h-[132px] overflow-hidden sm:aspect-[16/10] sm:min-h-0"
        style={{ background: tone.paperDeep }}
      >
        {item.image ? (
          <img
            src={item.image}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Link2 size={24} strokeWidth={1.3} style={{ color: tone.ink30 }} />
          </div>
        )}
        <span
          className="absolute left-2 top-2 max-w-[calc(100%-16px)] truncate rounded-full px-2 py-1 text-[9px] font-medium uppercase sm:left-3 sm:top-3 sm:px-2.5 sm:text-[10px]"
          style={{ background: `${tone.card}E8`, color: tone.ink70 }}
        >
          {item.eyebrow || label}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
        <h2
          className="line-clamp-2 font-serif text-[16px] leading-snug sm:text-[18px]"
          style={{ color: tone.ink }}
        >
          {item.title}
        </h2>
        <p
          className="mt-1.5 line-clamp-2 text-[11.5px] leading-[1.45] sm:mt-2 sm:text-[12.5px] sm:leading-5"
          style={{ color: tone.ink50 }}
        >
          {item.subtitle}
        </p>
        <button
          type="button"
          disabled={busy || !canShare}
          onClick={onActivate}
          className="mt-auto inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md px-3 text-[11.5px] font-medium disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-11 sm:px-4 sm:text-[13px]"
          style={{
            background: existing ? tone.paperDeep : tone.ink,
            color: existing ? tone.ink : tone.card,
          }}
        >
          {existing ? (
            <ExternalLink size={14} aria-hidden />
          ) : (
            <Share2 size={14} aria-hidden />
          )}
          {busy ? "…" : existing ? openLabel : createLabel}
        </button>
      </div>
    </article>
  );
}

export function ShareCenter({
  locale,
  isAdmin,
  canShare,
  agentId,
  shareIdentity,
}: {
  locale: "en" | "zh";
  isAdmin: boolean;
  canShare: boolean;
  agentId: number | null;
  shareIdentity: {
    name: string;
    photoUrl: string | null;
  } | null;
}) {
  const t = COPY[locale];
  const [view, setView] = useState<ViewMode>("library");
  const [kind, setKind] = useState<CatalogKind>("all");
  const [contentLocale, setContentLocale] = useState<"en" | "zh">(locale);
  const [listingScope, setListingScope] = useState<ListingScope>("homix");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<ShareCatalogResult | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [links, setLinks] = useState<ShareLinkSummary[]>([]);
  const [linkScope, setLinkScope] = useState<LinkScope>("mine");
  const [linksLoading, setLinksLoading] = useState(true);
  const [workingPath, setWorkingPath] = useState("");
  const [modalLink, setModalLink] = useState<ShareLinkSummary | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState("");
  const [inquiryRows, setInquiryRows] = useState<ShareInquiryDetail[]>([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(false);
  const [inquiriesError, setInquiriesError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [kind, contentLocale, debouncedQuery, listingScope]);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError("");
    const params = new URLSearchParams({
      kind,
      locale: contentLocale,
      page: String(page),
      listingScope,
    });
    if (debouncedQuery) params.set("q", debouncedQuery);
    fetch(`/api/share/catalog?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as
          | ShareCatalogResult
          | { error?: string };
        if (!response.ok) throw new Error(t.unavailable);
        setCatalog(body as ShareCatalogResult);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCatalogError(error instanceof Error ? error.message : t.unavailable);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });
    return () => controller.abort();
  }, [contentLocale, debouncedQuery, kind, listingScope, page, t.unavailable]);

  const loadLinks = useCallback(
    async (scope: LinkScope, includeAnalytics = false) => {
      setLinksLoading(true);
      try {
        const params = new URLSearchParams({ scope });
        if (includeAnalytics) params.set("analytics", "1");
        const response = await fetch(`/api/share/links?${params.toString()}`, {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => ({}))) as {
          links?: ShareLinkSummary[];
          error?: string;
        };
        if (!response.ok) throw new Error(t.loadLinksError);
        const rows = body.links ?? [];
        setLinks(rows);
        return rows;
      } catch (error) {
        setActionError(error instanceof Error ? error.message : t.loadLinksError);
        return [];
      } finally {
        setLinksLoading(false);
      }
    },
    [t.loadLinksError],
  );

  useEffect(() => {
    void loadLinks(linkScope, view === "analytics");
  }, [linkScope, loadLinks, view]);

  useEffect(() => {
    const linkId = modalLink?.id;
    if (!linkId || view === "analytics") return;
    void loadLinks(linkScope, true).then((rows) => {
      setModalLink((current) =>
        current?.id === linkId
          ? rows.find((row) => row.id === linkId) ?? current
          : current,
      );
    });
  }, [linkScope, loadLinks, modalLink?.id, view]);

  useEffect(() => {
    const linkId = modalLink?.id;
    setInquiryRows([]);
    setInquiriesError("");
    if (!linkId) {
      setInquiriesLoading(false);
      return;
    }

    const controller = new AbortController();
    setInquiriesLoading(true);
    fetch(`/api/share/inquiries?linkId=${linkId}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          inquiries?: ShareInquiryDetail[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(t.inquiryLoadError);
        }
        setInquiryRows(body.inquiries ?? []);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setInquiriesError(
          error instanceof Error ? error.message : t.inquiryLoadError,
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setInquiriesLoading(false);
      });

    return () => controller.abort();
  }, [modalLink?.id, t.inquiryLoadError]);

  const linksByContent = useMemo(
    () =>
      new Map(
        links
          .filter((link) => link.agentId === agentId)
          .map((link) => [
            `${link.contentKind}:${link.contentKey}:${link.locale}`,
            link,
          ]),
      ),
    [agentId, links],
  );

  const overviewGroups = useMemo(
    () =>
      OVERVIEW_KINDS.map((groupKind) => ({
        kind: groupKind,
        items: catalog?.items.filter((item) => item.kind === groupKind) ?? [],
      })).filter((group) => group.items.length > 0),
    [catalog?.items],
  );

  const totals = useMemo(
    () =>
      links.reduce(
        (sum, link) => ({
          active: sum.active + (link.isActive ? 1 : 0),
          visits: sum.visits + link.visits,
          visitors: sum.visitors + link.uniqueVisitors,
          inquiries: sum.inquiries + link.inquiries,
        }),
        { active: 0, visits: 0, visitors: 0, inquiries: 0 },
      ),
    [links],
  );

  async function createLink(item: ShareCatalogItem) {
    if (!canShare) return;
    setWorkingPath(item.path);
    setActionError("");
    try {
      const response = await fetch("/api/share/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contentPath: item.path,
          locale: contentLocale,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        link?: { code?: string };
        error?: string;
      };
      if (!response.ok) throw new Error(t.createError);
      const refreshed = await loadLinks(linkScope, false);
      const created = refreshed.find((link) => link.code === body.link?.code);
      if (created) setModalLink(created);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t.createError);
    } finally {
      setWorkingPath("");
    }
  }

  async function toggleLink(link: ShareLinkSummary) {
    setActionError("");
    const response = await fetch("/api/share/links", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: link.id, isActive: !link.isActive }),
    });
    if (!response.ok) {
      setActionError(t.updateError);
      return;
    }
    const refreshed = await loadLinks(linkScope, true);
    setModalLink(refreshed.find((row) => row.id === link.id) ?? null);
  }

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function nativeShare(link: ShareLinkSummary) {
    if (!navigator.share) {
      await copyLink(link.shareUrl);
      return;
    }
    try {
      await navigator.share({
        title: link.contentTitle,
        text: link.contentSubtitle || link.contentTitle,
        url: link.shareUrl,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copyLink(link.shareUrl);
    }
  }

  const pages =
    catalog && !catalog.overview
      ? catalog.totalIsEstimate
        ? page + (catalog.hasMore ? 1 : 0)
        : Math.max(1, Math.ceil(catalog.total / catalog.pageSize))
      : 1;
  const canGoNext = Boolean(
    catalog &&
      !catalog.overview &&
      (catalog.totalIsEstimate ? catalog.hasMore : page < pages),
  );

  const renderCatalogCards = (items: ShareCatalogItem[]) =>
    items.map((item) => {
      const existing = linksByContent.get(linkKey(item, contentLocale));
      return (
        <CatalogCard
          key={`${item.kind}:${item.key}`}
          item={item}
          label={t[item.kind]}
          existing={existing}
          busy={workingPath === item.path}
          canShare={canShare}
          createLabel={t.create}
          openLabel={t.openLink}
          onActivate={() =>
            existing ? setModalLink(existing) : void createLink(item)
          }
        />
      );
    });

  return (
    <div className="min-w-0 w-full space-y-7">
      {!canShare && (
        <div
          className="flex flex-wrap items-center justify-between gap-4 rounded-lg px-5 py-4"
          style={{ background: tone.amberSoft, border: `1px solid ${tone.amber}40` }}
        >
          <div>
            <p className="text-[14px] font-semibold" style={{ color: tone.ink }}>
              {t.profileNeeded}
            </p>
            <p className="mt-1 max-w-2xl text-[12.5px]" style={{ color: tone.ink50 }}>
              {t.profileNeededBody}
            </p>
          </div>
          <Link
            href="/profile/public"
            className="inline-flex h-10 items-center rounded-md px-4 text-[13px] font-medium"
            style={{ background: tone.ink, color: tone.card }}
          >
            {t.editProfile}
          </Link>
        </div>
      )}

      {shareIdentity && (
        <div
          className="flex flex-wrap items-center justify-between gap-4 rounded-lg px-4 py-3.5"
          style={{ background: tone.card, border: `1px solid ${tone.line}` }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full"
              style={{ background: tone.paperDeep, border: `1px solid ${tone.lineSoft}` }}
            >
              {shareIdentity.photoUrl ? (
                <img
                  src={shareIdentity.photoUrl}
                  alt={shareIdentity.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRoundCheck size={20} aria-hidden style={{ color: tone.ink30 }} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                {t.sharingAs}
              </p>
              <p className="mt-0.5 truncate text-[14px] font-semibold" style={{ color: tone.ink }}>
                {shareIdentity.name}
              </p>
              <p className="mt-0.5 text-[11.5px]" style={{ color: tone.ink50 }}>
                {t.sharingAsBody}
              </p>
            </div>
          </div>
          <Link
            href="/profile/public"
            className="inline-flex h-9 items-center rounded-md px-3 text-[12px] font-medium"
            style={{ background: tone.paperDeep, color: tone.ink70 }}
          >
            {t.checkIdentity}
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-lg p-1"
          style={{ background: tone.paperDeep }}
        >
          <button
            type="button"
            onClick={() => setView("library")}
            className="inline-flex h-9 items-center gap-2 rounded-md px-4 text-[13px] font-medium"
            style={{
              color: view === "library" ? tone.ink : tone.ink50,
              background: view === "library" ? tone.card : "transparent",
            }}
          >
            <Share2 size={15} aria-hidden />
            {t.library}
          </button>
          <button
            type="button"
            onClick={() => setView("analytics")}
            className="inline-flex h-9 items-center gap-2 rounded-md px-4 text-[13px] font-medium"
            style={{
              color: view === "analytics" ? tone.ink : tone.ink50,
              background: view === "analytics" ? tone.card : "transparent",
            }}
          >
            <BarChart3 size={15} aria-hidden />
            {t.analytics}
          </button>
        </div>

        {view === "analytics" && isAdmin && (
          <div
            className="inline-flex rounded-lg p-1"
            style={{ background: tone.paperDeep }}
          >
            {(["mine", "all"] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setLinkScope(scope)}
                className="h-8 rounded-md px-3 text-[12px] font-medium"
                style={{
                  color: linkScope === scope ? tone.ink : tone.ink50,
                  background: linkScope === scope ? tone.card : "transparent",
                }}
              >
                {scope === "mine" ? t.mine : t.company}
              </button>
            ))}
          </div>
        )}
      </div>

      {actionError && (
        <p
          role="alert"
          className="rounded-md px-4 py-3 text-[13px]"
          style={{ color: tone.rose, background: tone.roseSoft }}
        >
          {actionError}
        </p>
      )}

      {view === "library" ? (
        <>
          <div className="space-y-3">
            <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
              <div
                className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-3 sm:max-w-md"
                style={{ background: tone.card, border: `1px solid ${tone.line}` }}
              >
                <Search size={16} aria-hidden style={{ color: tone.ink30 }} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={kind === "listing" ? t.listingSearch : t.search}
                  aria-label={kind === "listing" ? t.listingSearch : t.search}
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                />
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:gap-3">
                <label className="relative min-w-0 md:hidden">
                  <span className="sr-only">{t.browseCategory}</span>
                  <select
                    value={kind}
                    onChange={(event) => setKind(event.target.value as CatalogKind)}
                    className="h-11 w-full appearance-none rounded-md bg-white pl-3 pr-9 text-[13px] font-medium outline-none"
                    style={{ border: `1px solid ${tone.line}`, color: tone.ink }}
                  >
                    {KINDS.map((value) => (
                      <option key={value} value={value}>
                        {t[value]}
                        {catalog?.counts[value] != null
                          ? ` (${catalog.counts[value]})`
                          : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={15}
                    aria-hidden
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: tone.ink50 }}
                  />
                </label>
                <div
                  className="inline-flex rounded-lg p-1"
                  style={{ background: tone.paperDeep }}
                >
                  {(["zh", "en"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setContentLocale(value)}
                      className="h-9 rounded-md px-3 text-[12px] font-medium"
                      style={{
                        color: contentLocale === value ? tone.ink : tone.ink50,
                        background:
                          contentLocale === value ? tone.card : "transparent",
                      }}
                    >
                      {value === "zh" ? t.chinese : t.english}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="hidden min-w-0 flex-wrap gap-1 md:flex">
              {KINDS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className="flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-[12.5px] font-medium"
                  style={{
                    background: kind === value ? tone.ink : "transparent",
                    color: kind === value ? tone.card : tone.ink50,
                  }}
                >
                  {t[value]}
                  {catalog?.counts[value] != null && (
                    <span
                      className="font-mono text-[10px]"
                      style={{ opacity: 0.7 }}
                    >
                      {catalog.counts[value]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {kind === "listing" && (
              <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                <span
                  className="text-[11px] font-medium uppercase tracking-[0.1em]"
                  style={{ color: tone.ink50 }}
                >
                  {t.listingSource}
                </span>
                <div
                  className="grid grid-cols-2 rounded-lg p-1 sm:inline-flex"
                  style={{ background: tone.paperDeep }}
                >
                  {(["homix", "all"] as const).map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => setListingScope(scope)}
                      aria-pressed={listingScope === scope}
                      className="h-9 rounded-md px-3 text-[12px] font-medium"
                      style={{
                        color: listingScope === scope ? tone.ink : tone.ink50,
                        background: listingScope === scope ? tone.card : "transparent",
                      }}
                    >
                      {scope === "all" ? t.allOneKey : t.homixOnly}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {catalogLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[132px] animate-pulse rounded-lg sm:h-[330px]"
                  style={{ background: tone.paperDeep }}
                />
              ))}
            </div>
          ) : catalogError ? (
            <Card className="p-10 text-center">
              <p className="text-[14px]" style={{ color: tone.rose }}>
                {catalogError}
              </p>
            </Card>
          ) : !catalog || catalog.items.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-[14px]" style={{ color: tone.ink50 }}>
                {t.empty}
              </p>
            </Card>
          ) : (
            <>
              {catalog.overview && !debouncedQuery ? (
                <div className="space-y-8 sm:space-y-10">
                  {overviewGroups.map((group) => (
                    <section key={group.kind} className="space-y-3">
                      <div
                        className="flex items-end justify-between gap-4 border-b pb-2.5"
                        style={{ borderColor: tone.lineSoft }}
                      >
                        <div>
                          <h2
                            className="font-serif text-[21px] leading-none sm:text-[24px]"
                            style={{ color: tone.ink }}
                          >
                            {t[group.kind]}
                          </h2>
                          {catalog.counts[group.kind] != null && (
                            <p className="mt-1.5 font-mono text-[10.5px]" style={{ color: tone.ink30 }}>
                              {catalog.counts[group.kind]} {t.results}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setKind(group.kind)}
                          className="inline-flex h-9 shrink-0 items-center gap-1 text-[12px] font-medium"
                          style={{ color: tone.accent }}
                        >
                          {t.browseAll}
                          <ChevronRight size={14} aria-hidden />
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                        {renderCatalogCards(group.items)}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <section className="space-y-3">
                  {catalog.overview && debouncedQuery && (
                    <h2 className="font-serif text-[22px]" style={{ color: tone.ink }}>
                      {t.searchResults}
                    </h2>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                    {renderCatalogCards(catalog.items)}
                  </div>
                </section>
              )}

              {!catalog.overview && (page > 1 || canGoNext) && (
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    className="inline-flex h-10 items-center gap-1 rounded-md px-3 text-[12.5px] disabled:opacity-35"
                    style={{ background: tone.card, border: `1px solid ${tone.line}` }}
                  >
                    <ChevronLeft size={15} aria-hidden />
                    {t.previous}
                  </button>
                  <span className="font-mono text-[12px]" style={{ color: tone.ink50 }}>
                    {catalog.totalIsEstimate ? page : `${page} / ${pages}`}
                  </span>
                  <button
                    type="button"
                    disabled={!canGoNext}
                    onClick={() => setPage((value) => value + 1)}
                    className="inline-flex h-10 items-center gap-1 rounded-md px-3 text-[12.5px] disabled:opacity-35"
                    style={{ background: tone.card, border: `1px solid ${tone.line}` }}
                  >
                    {t.next}
                    <ChevronRight size={15} aria-hidden />
                  </button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="grid gap-px overflow-hidden rounded-lg sm:grid-cols-4" style={{ background: tone.line }}>
            {[
              [t.links, totals.active],
              [t.views, totals.visits],
              [t.visitors, totals.visitors],
              [t.inquiries, totals.inquiries],
            ].map(([label, value]) => (
              <div key={String(label)} className="p-5" style={{ background: tone.card }}>
                <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                  {label}
                </p>
                <p className="mt-2 font-serif text-[30px]" style={{ color: tone.ink }}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {linksLoading ? (
            <div className="h-48 animate-pulse rounded-lg" style={{ background: tone.paperDeep }} />
          ) : links.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-[14px]" style={{ color: tone.ink50 }}>
                {t.noLinks}
              </p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {links.map((link, index) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setModalLink(link)}
                  className="grid w-full gap-4 px-4 py-5 text-left transition-colors hover:bg-[#FAF7F0] sm:grid-cols-[minmax(0,1fr)_repeat(4,90px)] sm:items-center sm:px-5"
                  style={{
                    borderTop: index ? `1px solid ${tone.lineSoft}` : undefined,
                  }}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="truncate font-medium text-[13.5px]"
                        style={{ color: tone.ink }}
                      >
                        {link.contentTitle}
                      </span>
                      {!link.isActive && (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[10px]"
                          style={{ background: tone.roseSoft, color: tone.rose }}
                        >
                          {t.disabled}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[11.5px]" style={{ color: tone.ink50 }}>
                      {isAdmin && linkScope === "all"
                        ? `${link.agentName} · `
                        : ""}
                      {link.shareUrl}
                    </p>
                  </div>
                  {[
                    [t.views, link.visits],
                    [t.visitors, link.uniqueVisitors],
                    [t.averageTime, formatDuration(link.averageActiveSeconds, locale)],
                    [t.inquiries, link.inquiries],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: tone.ink30 }}>
                        {label}
                      </p>
                      <p className="mt-1 font-mono text-[13px]" style={{ color: tone.ink70 }}>
                        {value}
                      </p>
                    </div>
                  ))}
                </button>
              ))}
            </Card>
          )}
        </>
      )}

      {modalLink && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t.shareTitle}
          onClick={() => setModalLink(null)}
        >
          <div
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg p-5 sm:p-6"
            style={{ background: tone.card, border: `1px solid ${tone.line}` }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-serif text-[24px]" style={{ color: tone.ink }}>
                  {t.shareTitle}
                </p>
                <p className="mt-1 text-[12.5px]" style={{ color: tone.ink50 }}>
                  {t.shareBody}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalLink(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                aria-label={t.close}
                style={{ background: tone.paperDeep }}
              >
                <X size={17} aria-hidden />
              </button>
            </div>

            <div className="mt-6 min-w-0">
              <p className="font-serif text-[19px] leading-snug" style={{ color: tone.ink }}>
                {modalLink.contentTitle}
              </p>
              <p className="mt-2 text-[12.5px] leading-5" style={{ color: tone.ink50 }}>
                {modalLink.contentSubtitle}
              </p>
              {isAdmin && linkScope === "all" && (
                <p className="mt-3 text-[12px]" style={{ color: tone.ink50 }}>
                  {t.createdFor}: {modalLink.agentName}
                </p>
              )}
              <div
                className="mt-4 break-all rounded-md px-3 py-3 font-mono text-[11px]"
                style={{ background: tone.paperDeep, color: tone.ink70 }}
              >
                {modalLink.shareUrl}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void nativeShare(modalLink)}
                  className="col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-md text-[13px] font-semibold transition hover:opacity-90"
                  style={{ background: tone.ink, color: tone.card }}
                >
                  <Share2 size={16} />
                  {t.share}
                </button>
                <button
                  type="button"
                  onClick={() => void copyLink(modalLink.shareUrl)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md text-[13px] font-medium"
                  style={{ background: tone.accentSoft, color: tone.accent }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? t.copied : t.copy}
                </button>
                <a
                  href={modalLink.shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-white text-[13px] font-medium"
                  style={{ border: `1px solid ${tone.line}`, color: tone.ink }}
                >
                  <ExternalLink size={15} />
                  {t.preview}
                </a>
              </div>
            </div>

            <div
              className="mt-6 grid gap-px overflow-hidden rounded-md sm:grid-cols-4"
              style={{ background: tone.lineSoft }}
            >
              {[
                [t.views, modalLink.visits],
                [t.visitors, modalLink.uniqueVisitors],
                [t.averageTime, formatDuration(modalLink.averageActiveSeconds, locale)],
                [t.scroll, `${modalLink.averageScrollDepth}%`],
                [t.medianTime, formatDuration(modalLink.medianActiveSeconds, locale)],
                [
                  t.contacts,
                  modalLink.callClicks +
                    modalLink.emailClicks +
                    modalLink.wechatClicks,
                ],
                [t.inquiries, modalLink.inquiries],
                [
                  t.lastVisit,
                  modalLink.lastVisitAt
                    ? new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(modalLink.lastVisitAt))
                    : t.never,
                ],
              ].map(([label, value]) => (
                <div key={String(label)} className="p-3" style={{ background: tone.paperDeep }}>
                  <p className="text-[9.5px] uppercase tracking-[0.08em]" style={{ color: tone.ink30 }}>
                    {label}
                  </p>
                  <p className="mt-1 text-[12.5px]" style={{ color: tone.ink70 }}>
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <section
              className="mt-6 border-t pt-5"
              style={{ borderColor: tone.lineSoft }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <MessageSquare
                    size={16}
                    aria-hidden
                    style={{ color: tone.accent }}
                  />
                  <h2
                    className="text-[14px] font-semibold"
                    style={{ color: tone.ink }}
                  >
                    {t.inquiryDetails}
                  </h2>
                </div>
                <span
                  className="font-mono text-[12px]"
                  style={{ color: tone.ink50 }}
                >
                  {modalLink.inquiries}
                </span>
              </div>

              {inquiriesLoading ? (
                <div
                  className="mt-4 h-28 animate-pulse rounded-md"
                  style={{ background: tone.paperDeep }}
                />
              ) : inquiriesError ? (
                <p
                  role="alert"
                  className="mt-4 rounded-md px-4 py-3 text-[12.5px]"
                  style={{ background: tone.roseSoft, color: tone.rose }}
                >
                  {inquiriesError}
                </p>
              ) : inquiryRows.length === 0 ? (
                <p
                  className="mt-4 rounded-md px-4 py-4 text-[12.5px]"
                  style={{ background: tone.paperDeep, color: tone.ink50 }}
                >
                  {t.inquiryEmpty}
                </p>
              ) : (
                <div
                  className="mt-4 overflow-hidden rounded-md"
                  style={{ border: `1px solid ${tone.lineSoft}` }}
                >
                  {inquiryRows.map((inquiry, index) => (
                    <article
                      key={inquiry.id}
                      className="p-4"
                      style={{
                        borderTop:
                          index > 0 ? `1px solid ${tone.lineSoft}` : undefined,
                      }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className="font-medium text-[14px]"
                            style={{ color: tone.ink }}
                          >
                            {inquiry.name}
                          </p>
                          <p
                            className="mt-1 text-[11px]"
                            style={{ color: tone.ink50 }}
                          >
                            {t.submitted}:{" "}
                            {inquiry.createdAt
                              ? new Intl.DateTimeFormat(
                                  locale === "zh" ? "zh-CN" : "en-US",
                                  {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                  },
                                ).format(new Date(inquiry.createdAt))
                              : "—"}
                          </p>
                        </div>
                        <span
                          className="rounded-full px-2.5 py-1 text-[10px] font-medium"
                          style={{
                            background:
                              inquiry.emailDelivery === "failed"
                                ? tone.roseSoft
                                : tone.greenSoft,
                            color:
                              inquiry.emailDelivery === "failed"
                                ? tone.rose
                                : tone.green,
                          }}
                          title={t.emailDelivery}
                        >
                          {inquiry.emailDelivery === "sent"
                            ? t.deliverySent
                            : inquiry.emailDelivery === "failed"
                              ? t.deliveryFailed
                              : t.deliveryStored}
                        </span>
                      </div>

                      <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                        <a
                          href={`mailto:${inquiry.email}`}
                          className="inline-flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-[12px]"
                          style={{
                            background: tone.paperDeep,
                            color: tone.ink70,
                          }}
                        >
                          <Mail size={14} className="shrink-0" aria-hidden />
                          <span className="truncate">{inquiry.email}</span>
                        </a>
                        {inquiry.phone && (
                          <a
                            href={`tel:${inquiry.phone}`}
                            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-[12px]"
                            style={{
                              background: tone.paperDeep,
                              color: tone.ink70,
                            }}
                          >
                            <Phone size={14} aria-hidden />
                            {inquiry.phone}
                          </a>
                        )}
                      </div>

                      <p
                        className="mt-3 whitespace-pre-wrap break-words text-[12.5px] leading-5"
                        style={{ color: tone.ink70 }}
                      >
                        {inquiry.message || t.noMessage}
                      </p>

                      {inquiry.pageUrl && (
                        <a
                          href={inquiry.pageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex max-w-full items-center gap-1.5 text-[11.5px]"
                          style={{ color: tone.accent }}
                        >
                          <ExternalLink size={13} className="shrink-0" />
                          <span className="truncate">
                            {t.sourcePage}: {inquiry.pagePath}
                          </span>
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section
              className="mt-6 border-t pt-5"
              style={{ borderColor: tone.lineSoft }}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[14px] font-semibold" style={{ color: tone.ink }}>
                  {t.qrCode}
                </h2>
                <button
                  type="button"
                  onClick={() => void toggleLink(modalLink)}
                  className="min-h-9 rounded-md px-3 text-[12px]"
                  style={{
                    border: `1px solid ${modalLink.isActive ? tone.rose : tone.green}`,
                    color: modalLink.isActive ? tone.rose : tone.green,
                  }}
                >
                  {modalLink.isActive ? t.stop : t.enable}
                </button>
              </div>
              <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <img
                  src={`/api/share/qr?code=${encodeURIComponent(modalLink.code)}`}
                  alt={t.qrCode}
                  className="aspect-square w-32 rounded-md sm:w-36"
                  style={{ border: `1px solid ${tone.line}` }}
                />
                <a
                  href={`/api/share/qr?code=${encodeURIComponent(modalLink.code)}`}
                  download={`homix-share-${modalLink.code}.svg`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-[12px] font-medium"
                  style={{ background: tone.paperDeep, color: tone.ink70 }}
                >
                  <Download size={14} aria-hidden />
                  {t.downloadQr}
                </a>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
