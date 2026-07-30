"use client";

/* Catalog thumbnails come from Homix Web and the MLS provider, so their hosts
   are intentionally dynamic rather than enumerated in next/image config. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import {
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Link2,
  Search,
  Share2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ShareCatalogItem,
  ShareCatalogResult,
  ShareContentKind,
} from "@/lib/homixweb";
import type { ShareLinkSummary } from "@/lib/share-center";
import { tone } from "@/components/homix/tokens";
import { Card } from "@/components/homix/server-primitives";

type CatalogKind = ShareContentKind | "all";
type ViewMode = "library" | "analytics";
type LinkScope = "mine" | "all";

const COPY = {
  en: {
    library: "Content",
    analytics: "Analytics",
    search: "Search listings, guides, neighborhoods…",
    all: "All",
    listing: "Listings",
    neighborhood: "Neighborhoods",
    community: "Communities",
    development: "New developments",
    guide: "Guides & articles",
    overviewHint:
      "A mixed preview is shown here. Open a category to browse every item.",
    results: "items",
    create: "Create my link",
    openLink: "Open share link",
    profileNeeded: "Publish your public profile before sharing",
    profileNeededBody:
      "Shared pages introduce you to the visitor, so your public profile must be visible first.",
    editProfile: "Open public profile",
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
    open: "Open",
    downloadQr: "Download QR",
    close: "Close",
    stop: "Disable link",
    enable: "Enable link",
    createdFor: "Shared by",
    chinese: "中文",
    english: "English",
  },
  zh: {
    library: "内容库",
    analytics: "分享数据",
    search: "搜索房源、指南、社区或楼盘…",
    all: "全部",
    listing: "房源",
    neighborhood: "区域指南",
    community: "封闭社区",
    development: "纽约新盘",
    guide: "指南与文章",
    overviewHint: "这里展示各分类的混合预览；进入具体分类可浏览其中全部内容。",
    results: "项内容",
    create: "生成我的分享链接",
    openLink: "打开专属链接",
    profileNeeded: "先公开个人主页，才能使用分享中心",
    profileNeededBody:
      "分享页会向访客介绍你，因此需要先让自己的 Homix 对外主页处于公开状态。",
    editProfile: "前往个人主页",
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
    open: "打开",
    downloadQr: "下载二维码",
    close: "关闭",
    stop: "停用链接",
    enable: "重新启用",
    createdFor: "分享经纪人",
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
  "guide",
];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function linkKey(
  item: Pick<ShareCatalogItem, "kind" | "key">,
  locale: "en" | "zh",
) {
  return `${item.kind}:${item.key}:${locale}`;
}

export function ShareCenter({
  locale,
  isAdmin,
  canShare,
  agentId,
}: {
  locale: "en" | "zh";
  isAdmin: boolean;
  canShare: boolean;
  agentId: number | null;
}) {
  const t = COPY[locale];
  const [view, setView] = useState<ViewMode>("library");
  const [kind, setKind] = useState<CatalogKind>("all");
  const [contentLocale, setContentLocale] = useState<"en" | "zh">(locale);
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

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [kind, contentLocale, debouncedQuery]);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError("");
    const params = new URLSearchParams({
      kind,
      locale: contentLocale,
      page: String(page),
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
        if (!response.ok) {
          throw new Error("error" in body ? body.error : t.unavailable);
        }
        setCatalog(body as ShareCatalogResult);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCatalogError(error instanceof Error ? error.message : t.unavailable);
      })
      .finally(() => setCatalogLoading(false));
    return () => controller.abort();
  }, [contentLocale, debouncedQuery, kind, page, t.unavailable]);

  const loadLinks = useCallback(
    async (scope = linkScope) => {
      setLinksLoading(true);
      try {
        const response = await fetch(`/api/share/links?scope=${scope}`, {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => ({}))) as {
          links?: ShareLinkSummary[];
          error?: string;
        };
        if (!response.ok) throw new Error(body.error || "Unable to load links");
        const rows = body.links ?? [];
        setLinks(rows);
        return rows;
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Unable to load links");
        return [];
      } finally {
        setLinksLoading(false);
      }
    },
    [linkScope],
  );

  useEffect(() => {
    void loadLinks(linkScope);
  }, [linkScope, loadLinks]);

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
      if (!response.ok) throw new Error(body.error || "Unable to create link");
      const refreshed = await loadLinks(linkScope);
      const created = refreshed.find((link) => link.code === body.link?.code);
      if (created) setModalLink(created);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to create link");
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
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setActionError(body.error || "Unable to update link");
      return;
    }
    const refreshed = await loadLinks(linkScope);
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
    await navigator.share({
      title: link.contentTitle,
      text: link.contentSubtitle || link.contentTitle,
      url: link.shareUrl,
    });
  }

  const pages =
    catalog && !catalog.overview
      ? Math.max(1, Math.ceil(catalog.total / catalog.pageSize))
      : 1;

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
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div
                className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-3 sm:max-w-md"
                style={{ background: tone.card, border: `1px solid ${tone.line}` }}
              >
                <Search size={16} aria-hidden style={{ color: tone.ink30 }} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t.search}
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                />
              </div>
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

            <div className="flex min-w-0 gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          </div>

          {catalog?.overview && (
            <p className="text-[12.5px]" style={{ color: tone.ink50 }}>
              {t.overviewHint}
            </p>
          )}

          {catalogLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[330px] animate-pulse rounded-lg"
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
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {catalog.items.map((item) => {
                  const existing = linksByContent.get(
                    linkKey(item, contentLocale),
                  );
                  const busy = workingPath === item.path;
                  return (
                    <article
                      key={`${item.kind}:${item.key}`}
                      className="flex min-h-[330px] flex-col overflow-hidden rounded-lg"
                      style={{ background: tone.card, border: `1px solid ${tone.line}` }}
                    >
                      <div
                        className="relative aspect-[16/10] overflow-hidden"
                        style={{ background: tone.paperDeep }}
                      >
                        {item.image ? (
                          <img
                            src={item.image}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Link2 size={28} strokeWidth={1.3} style={{ color: tone.ink30 }} />
                          </div>
                        )}
                        <span
                          className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase"
                          style={{ background: `${tone.card}E8`, color: tone.ink70 }}
                        >
                          {item.eyebrow || t[item.kind]}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <h2
                          className="line-clamp-2 font-serif text-[18px] leading-snug"
                          style={{ color: tone.ink }}
                        >
                          {item.title}
                        </h2>
                        <p
                          className="mt-2 line-clamp-2 text-[12.5px] leading-5"
                          style={{ color: tone.ink50 }}
                        >
                          {item.subtitle}
                        </p>
                        <button
                          type="button"
                          disabled={busy || !canShare}
                          onClick={() =>
                            existing
                              ? setModalLink(existing)
                              : void createLink(item)
                          }
                          className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-4 pt-0 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-45"
                          style={{
                            background: existing ? tone.paperDeep : tone.ink,
                            color: existing ? tone.ink : tone.card,
                          }}
                        >
                          {existing ? (
                            <ExternalLink size={15} aria-hidden />
                          ) : (
                            <Share2 size={15} aria-hidden />
                          )}
                          {busy
                            ? "…"
                            : existing
                              ? t.openLink
                              : t.create}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {!catalog.overview && pages > 1 && (
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
                    {page} / {pages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= pages}
                    onClick={() => setPage((value) => Math.min(pages, value + 1))}
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
                          OFF
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
                    [t.averageTime, formatDuration(link.averageActiveSeconds)],
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

            <div className="mt-6 grid gap-6 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-start">
              <div>
                <img
                  src={`/api/share/qr?code=${encodeURIComponent(modalLink.code)}`}
                  alt="QR code"
                  className="aspect-square w-full rounded-md"
                  style={{ border: `1px solid ${tone.line}` }}
                />
                <a
                  href={`/api/share/qr?code=${encodeURIComponent(modalLink.code)}`}
                  download={`homix-share-${modalLink.code}.svg`}
                  className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md text-[12px]"
                  style={{ background: tone.paperDeep, color: tone.ink70 }}
                >
                  <Download size={14} aria-hidden />
                  {t.downloadQr}
                </a>
              </div>

              <div className="min-w-0">
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
                    onClick={() => void copyLink(modalLink.shareUrl)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md text-[13px] font-medium"
                    style={{ background: tone.ink, color: tone.card }}
                  >
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    {copied ? t.copied : t.copy}
                  </button>
                  <button
                    type="button"
                    onClick={() => void nativeShare(modalLink)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md text-[13px] font-medium"
                    style={{ background: tone.paperDeep, color: tone.ink }}
                  >
                    <Share2 size={15} />
                    {t.open}
                  </button>
                  <a
                    href={modalLink.shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md text-[13px]"
                    style={{ border: `1px solid ${tone.line}`, color: tone.ink70 }}
                  >
                    <ExternalLink size={15} />
                    {t.open}
                  </a>
                  <button
                    type="button"
                    onClick={() => void toggleLink(modalLink)}
                    className="min-h-11 rounded-md text-[13px]"
                    style={{
                      border: `1px solid ${modalLink.isActive ? tone.rose : tone.green}`,
                      color: modalLink.isActive ? tone.rose : tone.green,
                    }}
                  >
                    {modalLink.isActive ? t.stop : t.enable}
                  </button>
                </div>
              </div>
            </div>

            <div
              className="mt-6 grid gap-px overflow-hidden rounded-md sm:grid-cols-4"
              style={{ background: tone.lineSoft }}
            >
              {[
                [t.views, modalLink.visits],
                [t.visitors, modalLink.uniqueVisitors],
                [t.averageTime, formatDuration(modalLink.averageActiveSeconds)],
                [t.scroll, `${modalLink.averageScrollDepth}%`],
                [t.medianTime, formatDuration(modalLink.medianActiveSeconds)],
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
          </div>
        </div>
      )}
    </div>
  );
}
