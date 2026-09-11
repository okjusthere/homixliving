"use client";
import { EventEditor } from "./event-editor";
import { contentEvents, newOpenHouseEvent } from "@/lib/content/events";
import { copyReviewStep, confirmPosterCopy } from "@/lib/content/copy-review";
import { generationErrorGuidance } from "@/lib/content/error-guidance";
/* eslint-disable @next/next/no-img-element -- Private authenticated artwork uses signed R2 URLs. */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Download,
  LoaderCircle,
  Plus,
  Settings2,
} from "lucide-react";
import { useLocale } from "@/lib/i18n-client";
import { PageHeader } from "@/components/homix/page-kit";
import { contentFetch, Field, TemplateArt } from "./ui";
import { ContentErrorDialog } from "./error-dialog";
import { HighlightPicker } from "./highlight-picker";
import { PhotoSorter } from "./photo-sorter";
import { inputSchema } from "@/lib/content/validation";
import { contentValidationMessage } from "@/lib/content/form-state";
import { ListingPicker } from "./listing-picker";
import {
  listingEvents,
  type StudioListing,
} from "@/lib/content/listing-source";
import { listingDetailLevel } from "@/lib/content/output-plan";
import {
  IMAGE_SIZES,
  LISTING_THEMES,
  type BrandContext,
  type ContentInput,
  type ContentTemplate,
  type Generation,
  type Holiday,
} from "@/lib/content/types";

const emptyInput: ContentInput = {
  kind: "listing",
  theme: "just_listed",
  language: "zh",
  events: [newOpenHouseEvent()],
  size: "1024x1280",
  includePortrait: true,
  headline: "",
  message: "",
  additionalInstructions: "",
  listing: { source: "manual", address: "", price: "", imageAssetIds: [] },
};

export function ContentStudio() {
  const locale = useLocale(),
    zh = locale === "zh",
    t = (en: string, cn: string) => (zh ? cn : en);
  const [tab, setTab] = useState<"listing" | "holiday" | "works">("listing");
  const [outputChoice, setOutputChoice] = useState<"both" | "en" | "zh">("zh");
  const [templates, setTemplates] = useState<ContentTemplate[]>([]),
    [holidays, setHolidays] = useState<Holiday[]>([]);
  const [settings, setSettings] = useState<{
    brand: BrandContext;
    admin: boolean;
    dailyLimit: number;
    azureConfigured: boolean;
    storageConfigured: boolean;
  } | null>(null);
  const [selected, setSelected] = useState<string>(""),
    [input, setInput] = useState<ContentInput>(emptyInput);
  const [works, setWorks] = useState<Generation[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [country, setCountry] = useState("ALL"),
    [month, setMonth] = useState("ALL"),
    [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState<string>();
  const [page, setPage] = useState(0),
    [hasMore, setHasMore] = useState(false);
  const requestKey = useRef<string | null>(null);
  const lastRefreshError = useRef("");
  const reportRefreshError = useCallback((error: Error) => {
    if (lastRefreshError.current !== error.message) {
      lastRefreshError.current = error.message;
      setError(error.message);
    }
  }, []);
  const reportedFailures = useRef(new Set<string>());
  const observedJobs = useRef(new Map<string, string>());
  const sessionStarted = useRef(Date.now());
  const refreshWorks = useCallback(async () => {
    const data = await contentFetch<{ generations: Generation[] }>(
      "/api/content/generations",
    );
    lastRefreshError.current = "";
    const failures = data.generations.filter(
      (g) =>
        ["failed", "needs_review"].includes(g.status) &&
        !reportedFailures.current.has(g.id) &&
        (new Date(g.createdAt).valueOf() >= sessionStarted.current ||
          ["queued", "preparing", "generating", "saving"].includes(
            observedJobs.current.get(g.id) || "",
          )),
    );
    for (const g of data.generations) observedJobs.current.set(g.id, g.status);
    for (const g of failures) reportedFailures.current.add(g.id);
    if (failures.length)
      setError(
        failures
          .map(
            (g) =>
              `${g.input.listing?.address || g.input.theme}: ${generationErrorGuidance(g.error, g.status, false)} / ${g.input.listing?.address || g.input.theme}：${generationErrorGuidance(g.error, g.status, true)}`,
          )
          .join("\n"),
      );
    setWorks(data.generations);
    setHasMore(data.generations.length === 24);
    setPage(0);
  }, []);
  useEffect(() => {
    let live = true;
    Promise.all([
      contentFetch<{ templates: ContentTemplate[] }>(
        `/api/content/templates${new URLSearchParams(window.location.search).has("template") ? "?admin=1" : ""}`,
      ),
      contentFetch<{ holidays: Holiday[] }>("/api/content/holidays"),
      contentFetch<NonNullable<typeof settings>>("/api/content/settings"),
    ])
      .then(([a, b, c]) => {
        if (live) {
          setTemplates(a.templates);
          setHolidays(b.holidays);
          setSettings(c);
          const previewId = new URLSearchParams(window.location.search).get(
            "template",
          );
          const preview = a.templates.find((v) => v.id === previewId);
          if (preview) {
            setSelected(preview.id);
            setTab(preview.config.kind);
            setInput({
              ...emptyInput,
              kind: preview.config.kind,
              theme:
                preview.config.themes[0] === "*"
                  ? b.holidays[0]?.id || ""
                  : preview.config.themes[0],
              listing:
                preview.config.kind === "listing"
                  ? emptyInput.listing
                  : undefined,
            });
          }
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (tab === "works") refreshWorks().catch(reportRefreshError);
  }, [tab, refreshWorks, reportRefreshError]);
  const running = works.some((g) =>
    ["queued", "preparing", "generating", "saving"].includes(g.status),
  );
  useEffect(() => {
    if (!running || tab !== "works") return;
    const timer = setInterval(
      () => refreshWorks().catch(reportRefreshError),
      6000,
    );
    return () => clearInterval(timer);
  }, [running, tab, refreshWorks, reportRefreshError]);
  const applicable = templates.filter(
    (v) =>
      v.config.kind === input.kind &&
      (v.config.themes.includes("*") || v.config.themes.includes(input.theme)),
  );
  const template = applicable.find((v) => v.id === selected) || applicable[0];
  const availableSizes = template?.config.sizes || [...IMAGE_SIZES];
  const selectedSize = availableSizes.includes(input.size)
    ? input.size
    : availableSizes[0];
  const highlightsSection = useRef<HTMLElement>(null);
  const [extracting, setExtracting] = useState(false);
  const hasExtractedHighlights = Boolean(input.listing?.highlightsModel);
  const copyStep = copyReviewStep(input);
  const needsHighlightsReview = copyStep !== "ready";
  const patch = (value: Partial<ContentInput>) => {
    requestKey.current = null;
    setInput((v) => ({ ...v, ...value }));
  };
  const patchListing = (
    value: Partial<NonNullable<ContentInput["listing"]>>,
  ) => {
    requestKey.current = null;
    const sourceChanged = Object.keys(value).some((key) =>
      [
        "address",
        "price",
        "beds",
        "baths",
        "area",
        "description",
        "annualPropertyTax",
        "monthlyMaintenanceFee",
        "associationFee",
        "associationFeeFrequency",
        "sourceKey",
      ].includes(key),
    );
    setInput((v) => ({
      ...v,
      listing: {
        source: "manual",
        address: "",
        price: "",
        imageAssetIds: [],
        ...v.listing,
        highlightsReviewed:
          sourceChanged || "highlights" in value || "financialFacts" in value
            ? false
            : v.listing?.highlightsReviewed,
        ...(sourceChanged
          ? {
              highlights: undefined,
              financialFacts: undefined,
              highlightsModel: undefined,
            }
          : {}),
        ...value,
      },
    }));
  };
  const listingRevision = useRef(0);
  useEffect(() => {
    listingRevision.current += 1;
  }, [input.listing]);
  async function extractHighlights() {
    if ((input.listing?.description?.trim().length || 0) < 10)
      throw new Error(
        t(
          "Add at least 10 characters to the original listing description, or choose basic details only.",
          "请在原始房源介绍中填写至少 10 个字符，或选择「仅用房源基本信息」。",
        ),
      );
    setExtracting(true);
    try {
      const sourceRevision = listingRevision.current;
      const result = await contentFetch<{
        highlights: NonNullable<ContentInput["listing"]>["highlights"];
        financialFacts: NonNullable<ContentInput["listing"]>["financialFacts"];
        model: string;
      }>("/api/content/highlights", {
        method: "POST",
        body: JSON.stringify({ listing: input.listing }),
      });
      if (sourceRevision !== listingRevision.current)
        throw new Error(
          t(
            "Listing details changed during extraction. Please extract again.",
            "提取期间房源资料发生变化，请重新提取。",
          ),
        );
      patchListing({
        highlights: result.highlights?.map((h) => ({
          ...h,
          selected: true,
        })),
        financialFacts: result.financialFacts?.map((h) => ({
          ...h,
          selected: true,
        })),
        highlightsModel: result.model,
        highlightsReviewed: false,
      });
      requestAnimationFrame(() => {
        highlightsSection.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        highlightsSection.current?.focus({ preventScroll: true });
      });
    } finally {
      setExtracting(false);
    }
  }
  const selectTab = (next: typeof tab) => {
    setTab(next);
    setError("");
    if (next !== "works" && input.kind !== next) {
      setSelected("");
      setProjectId(undefined);
      patch({
        ...emptyInput,
        kind: next,
        theme: next === "listing" ? "just_listed" : holidays[0]?.id || "",
        listing: next === "listing" ? emptyInput.listing : undefined,
      });
    }
  };
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    const body = new FormData();
    body.set("file", file);
    const { asset } = await contentFetch<{ asset: { id: string } }>(
      "/api/content/assets",
      { method: "POST", body },
    );
    patchListing({
      imageAssetIds: [...(input.listing?.imageAssetIds || []), asset.id].slice(
        0,
        4,
      ),
    });
  }
  async function chooseListing(listing: StudioListing, photos: string[]) {
    const sourceRevision = listingRevision.current;
    setBusy(true);
    try {
      const imageAssetIds: string[] = [];
      for (const url of photos.slice(0, 4)) {
        const { asset } = await contentFetch<{ asset: { id: string } }>(
          "/api/content/assets",
          { method: "POST", body: JSON.stringify({ url }) },
        );
        imageAssetIds.push(asset.id);
      }
      if (sourceRevision !== listingRevision.current)
        throw new Error(
          t(
            "Property details changed during import; select the listing again.",
            "导入期间房源资料已变化，请重新选择房源。",
          ),
        );
      patchListing({
        source: "mls",
        sourceKey: listing.id,
        address: listing.address.full,
        price: (
          input.theme === "just_sold" ? listing.closePrice : listing.askingPrice
        )
          ? `$${(input.theme === "just_sold" ? listing.closePrice! : listing.askingPrice!).toLocaleString("en-US")}`
          : "",
        beds: String(listing.beds ?? ""),
        baths: String(listing.baths + (listing.halfBaths || 0) * 0.5 || ""),
        area: String(listing.sqft || ""),
        description: listing.description || "",
        annualPropertyTax: listing.annualPropertyTax || "",
        monthlyMaintenanceFee: listing.monthlyMaintenanceFee || "",
        associationFee: listing.associationFee || "",
        associationFeeFrequency: listing.associationFeeFrequency || "",
        imageAssetIds,
        fetchedAt: new Date().toISOString(),
        sourceStatus: listing.status,
      });
      const events = listingEvents(listing);
      patch({
        events: events.length ? events : [newOpenHouseEvent()],
        event: undefined,
      });
      setProjectId(undefined);
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (!template)
      throw new Error(
        t("Choose a published style first", "请先选择已发布的风格"),
      );
    // The primary action explicitly confirms the selected copy and submits it
    // in one step. A missing extraction still leads to selection, never generation.
    if (copyStep === "extract") {
      await extractHighlights();
      return;
    }
    const confirmedInput = confirmPosterCopy({ ...input, size: selectedSize });
    const validated = inputSchema.safeParse(confirmedInput);
    if (!validated.success)
      throw new Error(contentValidationMessage(validated.error.issues));
    requestKey.current ??= crypto.randomUUID();
    const { generationId } = await contentFetch<{ generationId: string }>(
      "/api/content/generations",
      {
        method: "POST",
        body: JSON.stringify({
          templateId: template.id,
          input: validated.data,
          languages: outputChoice === "both" ? ["zh", "en"] : [outputChoice],
          projectId,
          idempotencyKey: requestKey.current,
        }),
      },
    );
    const { generation } = await contentFetch<{ generation: Generation }>(
      `/api/content/generations/${generationId}`,
    );
    setProjectId(generation.projectId);
    setWorks((v) => [generation, ...v.filter((g) => g.id !== generation.id)]);
    setTab("works");
    requestKey.current = null;
  }
  const chosenHoliday = holidays.find((h) => h.id === input.theme);
  const todayParts = new Intl.DateTimeFormat("en", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const today = ["year", "month", "day"]
    .map((type) => todayParts.find((p) => p.type === type)?.value)
    .join("-");
  const nextDate = (h: Holiday) =>
    h.dates
      .map((d) => d.date)
      .filter((d) => d >= today)
      .sort()[0] || "";
  const visibleHolidays = holidays
    .filter(
      (h) =>
        (country === "ALL" || h.country === country) &&
        (month === "ALL" ||
          h.dates.some((d) => d.date.slice(5, 7) === month)) &&
        `${h.name.en} ${h.name.zh}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      (nextDate(a) || "9999").localeCompare(nextDate(b) || "9999"),
    );
  const generationLabel = extracting
    ? t("Finding selling points…", "正在提取卖点…")
    : copyStep === "extract"
      ? t("Find selling points & continue", "提取卖点，继续")
      : copyStep === "confirm"
        ? running
          ? t("Confirm copy & join queue", "确认文案并加入队列")
          : outputChoice === "both"
            ? t("Confirm copy & create both posters", "确认文案并生成两份")
            : t("Confirm copy & create poster", "确认文案并生成海报")
        : running
          ? t("Add to generation queue", "加入生成队列")
          : outputChoice === "both"
            ? t("Create Chinese & English posters", "生成中文和英文两份")
            : t("Create my poster", "生成我的海报");
  const status = (s: string) =>
    ({
      queued: t("Queued", "排队中"),
      preparing: t("Preparing photos", "准备素材"),
      generating: t("Creating your poster", "正在创作"),
      saving: t("Saving artwork", "保存作品"),
      succeeded: t("Ready", "已完成"),
      failed: t("Generation failed", "生成失败"),
      needs_review: t("Outcome needs review", "结果待检查"),
    })[s] || s;
  return (
    <div className="studio">
      <PageHeader
        eyebrow="HOMIX / PERSONAL MARKETING"
        title={t("Content studio", "内容中心")}
        description={t(
          "Turn a new listing or a meaningful occasion into something distinctly yours.",
          "让每一次房源上新、每一个重要节日，都带上你的个人风格。",
        )}
        actions={
          settings?.admin ? (
            <Link
              className="studio-button secondary"
              href="/content/admin/templates"
            >
              <Settings2 size={15} />
              {t("Manage templates", "管理模板")}
            </Link>
          ) : undefined
        }
      />
      <div
        className="studio-tabs"
        role="tablist"
        aria-label={t("Content type", "内容类型")}
      >
        {(["listing", "holiday", "works"] as const).map((v) => (
          <button
            role="tab"
            aria-selected={tab === v}
            key={v}
            onClick={() => selectTab(v)}
          >
            {v === "listing"
              ? t("Listing posters", "房源海报")
              : v === "holiday"
                ? t("Holiday greetings", "节日祝福")
                : t("My artwork", "我的作品")}
          </button>
        ))}
      </div>
      <ContentErrorDialog
        message={error}
        onClose={() => setError("")}
        zh={zh}
      />
      {loading ? (
        <div className="studio-empty">
          {t("Loading your studio…", "正在加载内容中心…")}
        </div>
      ) : tab === "works" ? (
        <>
          {!works.length ? (
            <div className="studio-empty">
              <h2>{t("Your collection starts here", "从第一张作品开始")}</h2>
              <p className="studio-note">
                {t(
                  "Create a listing poster or a personal holiday greeting.",
                  "选择房源主题或节日，创作你的专属海报。",
                )}
              </p>
              <button
                className="studio-button"
                onClick={() => selectTab("listing")}
              >
                {t("Create a poster", "创作海报")}
                <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <div className="studio-works">
              {works.map((g) => (
                <article className="studio-work" key={g.id}>
                  {g.outputAssetId ? (
                    <a
                      href={`/api/content/assets/${g.outputAssetId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={`/api/content/assets/${g.outputAssetId}`}
                        alt={
                          g.input.headline ||
                          g.input.listing?.address ||
                          g.input.theme
                        }
                      />
                    </a>
                  ) : (
                    <div className="studio-work-status">
                      {["queued", "preparing", "generating", "saving"].includes(
                        g.status,
                      ) && <LoaderCircle className="animate-spin" size={23} />}
                      <span>{status(g.status)}</span>
                    </div>
                  )}
                  <div className="studio-work-body">
                    <div className="studio-kicker">
                      {g.input.language === "zh"
                        ? "中文版"
                        : g.input.language === "en"
                          ? "English"
                          : "Legacy bilingual"}{" "}
                      / {g.input.size}
                    </div>
                    <h3>
                      {g.input.listing?.address ||
                        g.input.headline ||
                        holidays.find((h) => h.id === g.input.theme)?.name[
                          locale
                        ] ||
                        g.input.theme}
                    </h3>
                    <p className="studio-note">
                      {status(g.status)} ·{" "}
                      {new Date(g.createdAt).toLocaleDateString(locale)}
                    </p>
                    {g.error && (
                      <p className="studio-note">
                        {generationErrorGuidance(
                          g.error,
                          g.status,
                          locale === "zh",
                        )}
                      </p>
                    )}
                    <div className="studio-row">
                      {g.outputAssetId && (
                        <a
                          className="studio-button"
                          href={`/api/content/assets/${g.outputAssetId}?download=1`}
                        >
                          <Download size={14} />
                          {t("Download", "下载")}
                        </a>
                      )}
                      <button
                        className="studio-button secondary"
                        onClick={() => {
                          setInput({
                            ...g.input,
                            events: contentEvents(g.input),
                            event: undefined,
                            language:
                              g.input.language === "bilingual"
                                ? "zh"
                                : g.input.language,
                          });
                          setOutputChoice(
                            g.input.language === "bilingual"
                              ? "zh"
                              : g.input.language,
                          );
                          setProjectId(g.projectId);
                          setSelected(g.templateId);
                          setTab(g.input.kind);
                          requestKey.current = null;
                        }}
                      >
                        {t("Use again", "再次使用")}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {hasMore && (
            <button
              className="studio-button secondary mt-6"
              onClick={() =>
                act(async () => {
                  const next = page + 1;
                  const data = await contentFetch<{
                    generations: Generation[];
                  }>(`/api/content/generations?page=${next}`);
                  setWorks((v) => [...v, ...data.generations]);
                  setHasMore(data.generations.length === 24);
                  setPage(next);
                })
              }
            >
              {t("Load more", "加载更多")}
            </button>
          )}
        </>
      ) : (
        <div className="studio-grid">
          <main>
            <section className="studio-section">
              <div className="studio-kicker">
                01 / {t("The occasion", "选择主题")}
              </div>
              <h2>
                {input.kind === "listing"
                  ? t("What’s the news?", "这次带来什么好消息？")
                  : t("A reason to reach out", "每个节日，一份心意")}
              </h2>
              {input.kind === "listing" ? (
                ["PRE-LIST", "ACTIVE", "PROCESS", "SOLD"].map((group) => (
                  <div className="studio-group" key={group}>
                    <div className="studio-kicker">{group}</div>
                    <div className="studio-topics">
                      {LISTING_THEMES.filter((s) => s.group === group).map(
                        (s) => (
                          <button
                            className={`studio-topic ${input.theme === s.id ? "selected" : ""}`}
                            aria-pressed={input.theme === s.id}
                            key={s.id}
                            onClick={() => {
                              patch({
                                theme: s.id,
                                headline: "",
                                ...(s.id === "open_house" &&
                                !contentEvents(input).length
                                  ? {
                                      events: [newOpenHouseEvent()],
                                      event: undefined,
                                    }
                                  : {}),
                              });
                              setSelected("");
                            }}
                          >
                            {s.en}
                            {zh && <small>{s.zh}</small>}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <>
                  <div className="studio-row">
                    <Field label={t("Country", "国家")}>
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                      >
                        <option value="ALL">
                          {t("All holidays", "全部节日")}
                        </option>
                        <option value="US">{t("United States", "美国")}</option>
                        <option value="CN">{t("China", "中国")}</option>
                      </select>
                    </Field>
                    <Field label={t("Month", "月份")}>
                      <select
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                      >
                        <option value="ALL">{t("All months", "全年")}</option>
                        {Array.from({ length: 12 }, (_, i) => (
                          <option
                            value={String(i + 1).padStart(2, "0")}
                            key={i}
                          >
                            {i + 1}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <input
                    className="studio-search"
                    aria-label={t("Search holidays", "搜索节日")}
                    placeholder={t("Find a holiday…", "查找节日…")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="studio-holidays">
                    {visibleHolidays.map((h) => (
                      <button
                        className={`studio-holiday ${input.theme === h.id ? "selected" : ""}`}
                        aria-pressed={input.theme === h.id}
                        key={h.id}
                        onClick={() =>
                          patch({
                            theme: h.id,
                            headline: "",
                            message:
                              input.language === "bilingual"
                                ? `${h.greeting.en}\n${h.greeting.zh}`
                                : h.greeting[input.language],
                            holidayDate: nextDate(h) || undefined,
                          })
                        }
                      >
                        {h.name[locale]}
                        <small>
                          {h.country} ·{" "}
                          {nextDate(h) || t("Choose any date", "自选日期")}
                        </small>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
            <section className="studio-section">
              <div className="studio-kicker">
                02 / {t("Art direction", "选择风格")}
              </div>
              <h2>{t("Make it feel like you", "选一种你的风格")}</h2>
              <div className="studio-styles">
                {applicable.map((v) => (
                  <button
                    className={`studio-style ${v.id === template?.id ? "selected" : ""}`}
                    aria-pressed={v.id === template?.id}
                    key={v.id}
                    onClick={() => {
                      setSelected(v.id);
                      requestKey.current = null;
                    }}
                  >
                    <TemplateArt
                      template={v}
                      title={
                        input.kind === "holiday"
                          ? chosenHoliday?.name[locale]
                          : undefined
                      }
                    />
                    <div className="studio-style-caption">
                      <span>{v.config.name[locale].split(" · ").at(-1)}</span>
                      {v.id === template?.id && <Check size={15} />}
                    </div>
                  </button>
                ))}
              </div>
              <p className="studio-note">
                {t(
                  "Style illustrations show the design direction. Your finished poster uses your own photos and details.",
                  "风格示意用于展示设计方向，生成作品会使用你的真实照片和资料。",
                )}
              </p>
            </section>
            {input.kind === "listing" && (
              <section className="studio-section">
                <div className="studio-kicker">
                  03 / {t("The property", "房源资料")}
                </div>
                <h2>{t("Bring the home into focus", "让房源成为主角")}</h2>
                <div className="studio-panel">
                  <ListingPicker
                    zh={zh}
                    disabled={busy}
                    onChoose={chooseListing}
                    onError={setError}
                  />
                  <p className="studio-note">
                    {t(
                      "Or enter the details and upload photos below.",
                      "也可以直接填写资料并上传房源照片。",
                    )}
                  </p>
                  <Field label={t("Property address", "房源地址")}>
                    <input
                      value={input.listing?.address || ""}
                      onChange={(e) =>
                        patchListing({ address: e.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label={t("Price to display (optional)", "展示价格（选填）")}
                    hint={t(
                      "For Just Sold, enter only a confirmed closing price or leave blank.",
                      "成功售出海报仅填写已确认的成交价格，也可留空。",
                    )}
                  >
                    <input
                      value={input.listing?.price || ""}
                      onChange={(e) => patchListing({ price: e.target.value })}
                    />
                  </Field>
                  <div className="studio-row">
                    {(
                      [
                        ["beds", t("Beds", "卧室")],
                        ["baths", t("Baths", "卫浴")],
                        [
                          "area",
                          t("Interior area (sq ft)", "室内面积（平方英尺）"),
                        ],
                      ] as const
                    ).map(([key, label]) => (
                      <Field label={label} key={key}>
                        <input
                          value={input.listing?.[key] || ""}
                          onChange={(e) =>
                            patchListing({ [key]: e.target.value })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                  {listingDetailLevel(input.theme) !== "brief" && (
                    <>
                      <details
                        className="studio-source-details"
                        key={input.listing?.sourceKey || "manual"}
                        open={
                          input.listing?.source !== "mls" ? true : undefined
                        }
                      >
                        <summary>
                          {t("Original listing description", "原始房源介绍")}
                          <span>{t("View or edit", "查看 / 修改")}</span>
                        </summary>
                        <Field
                          label={t("Source description", "房源原文")}
                          hint={t(
                            "Used only to identify supported selling points and costs.",
                            "用于提取有原文依据的卖点和费用。",
                          )}
                        >
                          <textarea
                            value={input.listing?.description || ""}
                            onChange={(e) =>
                              patchListing({ description: e.target.value })
                            }
                          />
                        </Field>
                      </details>
                      <section
                        ref={highlightsSection}
                        tabIndex={-1}
                        className="studio-selling-points"
                        aria-label={t("Property selling points", "房源卖点")}
                      >
                        <div className="studio-highlight-heading">
                          <h3>{t("Property selling points", "房源卖点")}</h3>
                          <span>{t("Optional", "可选")}</span>
                        </div>
                        <p className="studio-note">
                          {hasExtractedHighlights
                            ? t(
                                "Select any points you want, including taxes and fees. Your selection is confirmed when you generate.",
                                "点击卡片选择需要的亮点，数量不限，地税和管理费也包含在内。点击生成时一并确认。",
                              )
                            : t(
                                "Let AI suggest selling points, or continue with the address, price and property facts only.",
                                "让 AI 帮你挑选卖点，也可以只用地址、价格和房源资料直接生成。",
                              )}
                        </p>
                        <div className="studio-highlight-actions">
                          <button
                            className="studio-button secondary"
                            disabled={busy}
                            onClick={() => act(extractHighlights)}
                          >
                            {extracting && (
                              <LoaderCircle
                                size={16}
                                className="animate-spin"
                              />
                            )}
                            {extracting
                              ? t("Finding selling points…", "正在提取卖点…")
                              : hasExtractedHighlights
                                ? t("Extract again", "重新提取")
                                : t("Suggest selling points", "AI 推荐卖点")}
                          </button>
                          {!hasExtractedHighlights &&
                            !input.listing?.highlightsReviewed && (
                              <button
                                className="studio-back-link"
                                disabled={busy}
                                onClick={() =>
                                  patchListing({
                                    highlights: [],
                                    financialFacts: [],
                                    highlightsReviewed: true,
                                  })
                                }
                              >
                                {t(
                                  "Use basic details only",
                                  "仅用房源基本信息",
                                )}
                              </button>
                            )}
                        </div>
                        {!hasExtractedHighlights &&
                          input.listing?.highlightsReviewed && (
                            <p className="studio-note" role="status">
                              {t(
                                "Using basic details only. You can generate now, or add AI selling points anytime.",
                                "已选择仅用基本信息，可以直接生成；也可随时添加 AI 卖点。",
                              )}
                            </p>
                          )}
                        {listingDetailLevel(input.theme) === "detailed" && (
                          <details className="studio-source-details">
                            <summary>{t("Add or edit tax and fee highlights", "添加或修改税费亮点")}</summary>
                            <p className="studio-note">
                              {t(
                                "Enter confirmed amounts with their billing period. Blank costs are omitted from the poster, never treated as zero.",
                                "仅填写已确认的金额并注明周期。未填写的费用不会展示，也不会按零计算。",
                              )}
                            </p>
                            <div className="studio-row">
                              <Field
                                label={t(
                                  "Property tax / year (USD)",
                                  "地税／年（美元）",
                                )}
                              >
                                <input
                                  value={input.listing?.annualPropertyTax || ""}
                                  onChange={(e) =>
                                    patchListing({
                                      annualPropertyTax: e.target.value,
                                    })
                                  }
                                />
                              </Field>
                              <Field
                                label={t(
                                  "Maintenance / month (USD)",
                                  "管理费／月（美元）",
                                )}
                              >
                                <input
                                  value={input.listing?.monthlyMaintenanceFee || ""}
                                  onChange={(e) =>
                                    patchListing({
                                      monthlyMaintenanceFee: e.target.value,
                                    })
                                  }
                                />
                              </Field>
                            </div>
                            <div className="studio-row">
                              <Field
                                label={t(
                                  "HOA / association fee (USD)",
                                  "HOA／协会费（美元）",
                                )}
                              >
                                <input
                                  value={input.listing?.associationFee || ""}
                                  onChange={(e) =>
                                    patchListing({ associationFee: e.target.value })
                                  }
                                />
                              </Field>
                              <Field label={t("HOA billing period", "HOA 收费周期")}>
                                <select
                                  value={input.listing?.associationFeeFrequency || ""}
                                  onChange={(e) =>
                                    patchListing({
                                      associationFeeFrequency: e.target.value,
                                    })
                                  }
                                >
                                  <option value="">
                                    {t("Select period", "选择周期")}
                                  </option>
                                  <option value="Monthly">
                                    {t("Monthly", "每月")}
                                  </option>
                                  <option value="Quarterly">
                                    {t("Quarterly", "每季度")}
                                  </option>
                                  <option value="Annually">
                                    {t("Annually", "每年")}
                                  </option>
                                </select>
                              </Field>
                            </div>
                          </details>
                        )}
                        {input.listing && (
                          <HighlightPicker
                            listing={input.listing}
                            zh={zh}
                            busy={busy}
                            onChange={patchListing}
                          />
                        )}
                        {hasExtractedHighlights &&
                          !input.listing?.highlights?.length &&
                          !input.listing?.financialFacts?.length && (
                            <p className="studio-note" role="status">
                              {t(
                                "No specific selling points were found. You can still generate using the property facts.",
                                "没有找到足够明确的卖点，可直接使用房源基本信息生成。",
                              )}
                            </p>
                          )}
                        {(hasExtractedHighlights ||
                          input.listing?.highlightsReviewed) && (
                          <div className="studio-highlight-next">
                            <button
                              className="studio-button"
                              disabled={
                                busy ||
                                !template ||
                                !settings?.azureConfigured ||
                                !settings.storageConfigured
                              }
                              onClick={() => act(generate)}
                            >
                              {busy && (
                                <LoaderCircle
                                  size={16}
                                  className="animate-spin"
                                />
                              )}
                              {generationLabel}
                            </button>
                            <span>
                              {outputChoice === "both"
                                ? t(
                                    "Chinese + English · 2 separate posters",
                                    "中文 + 英文 · 两张独立海报",
                                  )
                                : outputChoice === "zh"
                                  ? t("Chinese · 1 poster", "中文 · 一张海报")
                                  : t("English · 1 poster", "英文 · 一张海报")}
                            </span>
                          </div>
                        )}
                      </section>
                    </>
                  )}
                  <PhotoSorter
                    ids={input.listing?.imageAssetIds || []}
                    disabled={busy}
                    zh={zh}
                    onChange={(imageAssetIds) =>
                      patchListing({ imageAssetIds })
                    }
                  />
                  <Field
                    label={t("Property photos (1–4)", "房源照片（1–4 张）")}
                  >
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={
                        busy || (input.listing?.imageAssetIds.length || 0) >= 4
                      }
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) act(() => upload(file));
                        e.target.value = "";
                      }}
                    />
                  </Field>
                </div>
              </section>
            )}
          </main>
          <aside className="studio-sidebar studio-panel">
            <h2>{t("Your signature", "你的专属名片")}</h2>
            {settings && (
              <div className="studio-identity">
                {settings.brand.photoUrl && (
                  <img
                    src={settings.brand.photoUrl}
                    alt={settings.brand.name}
                  />
                )}
                <div>
                  <strong>{settings.brand.name}</strong>
                  <small>{settings.brand.companyName}</small>
                  <small>{settings.brand.email}</small>
                  <small>{settings.brand.phone}</small>
                </div>
              </div>
            )}
            <Link className="studio-note underline" href="/profile/public">
              {t("Edit saved profile", "修改已保存的个人资料")}
            </Link>
            <label className="studio-check">
              <input
                type="checkbox"
                checked={input.includePortrait}
                onChange={(e) => patch({ includePortrait: e.target.checked })}
              />
              {t("Include my portrait", "加入我的头像")}
            </label>
            <p className="studio-note">
              {t(
                "The Homix company logo is included on every poster.",
                "每张海报都会自动加入 Homix 公司 Logo。",
              )}
            </p>
            <Field label={t("Output versions", "生成版本")}>
              <select
                value={outputChoice}
                onChange={(e) => {
                  const choice = e.target.value as "both" | "en" | "zh";
                  setOutputChoice(choice);
                  patch({
                    language: choice === "both" ? "en" : choice,
                  });
                }}
              >
                <option value="both">
                  {t(
                    "Chinese + English · 2 separate posters",
                    "中文＋英文 · 分别生成两张",
                  )}
                </option>
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </Field>
            <Field label={t("Format", "画幅")}>
              <select
                value={selectedSize}
                onChange={(e) =>
                  patch({ size: e.target.value as ContentInput["size"] })
                }
              >
                {availableSizes.map((s) => (
                  <option key={s} value={s}>
                    {
                      {
                        "1024x1024": t("Square", "方形"),
                        "1024x1280": t("Portrait", "竖版"),
                        "1152x2048": "Story",
                      }[s]
                    }{" "}
                    · {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Headline (optional)", "主标题（选填）")}>
              <input
                value={input.headline}
                placeholder={
                  input.kind === "listing"
                    ? LISTING_THEMES.find((v) => v.id === input.theme)?.[locale]
                    : chosenHoliday?.name[locale]
                }
                onChange={(e) => patch({ headline: e.target.value })}
              />
            </Field>
            <Field
              label={
                input.kind === "holiday"
                  ? t("Your greeting", "节日祝福语")
                  : t("Personal message", "补充文案")
              }
            >
              <textarea
                value={input.message}
                onChange={(e) => patch({ message: e.target.value })}
              />
            </Field>
            {input.kind === "holiday" && (
              <Field label={t("Holiday date (optional)", "节日日期（选填）")}>
                <input
                  type="date"
                  value={input.holidayDate || ""}
                  onChange={(e) =>
                    patch({ holidayDate: e.target.value || undefined })
                  }
                />
              </Field>
            )}
            {input.theme === "open_house" && (
              <EventEditor
                events={contentEvents(input)}
                zh={zh}
                disabled={busy}
                onChange={(events) => patch({ events, event: undefined })}
              />
            )}
            <Field
              label={t("Creative notes (optional)", "本次风格要求（选填）")}
            >
              <textarea
                placeholder={t(
                  "A softer palette, a larger headline…",
                  "例如：颜色柔和一些，标题更醒目…",
                )}
                value={input.additionalInstructions}
                onChange={(e) =>
                  patch({ additionalInstructions: e.target.value })
                }
              />
            </Field>
            <button
              className="studio-button w-full"
              disabled={
                busy ||
                !template ||
                !settings?.azureConfigured ||
                !settings.storageConfigured
              }
              onClick={() => act(generate)}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : (
                <Plus size={16} />
              )}{" "}
              {generationLabel}
            </button>
            {running && (
              <p className="studio-note">
                {t(
                  "Your earlier posters are still processing. New posters will join the queue and start in order automatically.",
                  "之前的海报仍在处理中，新提交的海报会加入队列，按顺序自动开始。",
                )}
              </p>
            )}
            {needsHighlightsReview && (
              <p className="studio-note">
                {t(
                  hasExtractedHighlights
                    ? "Review your selected cards, then confirm and generate in one click."
                    : "First choose AI selling points or basic details only in the property section.",
                  hasExtractedHighlights
                    ? "看一眼已选卡片，点击上方按钮即可确认并生成。"
                    : "先提取卖点，或在房源卖点区域选择「仅用房源基本信息」。",
                )}
              </p>
            )}
            <p className="studio-note">
              {outputChoice === "both"
                ? t(
                    "Two separate images, created in sequence; uses 2 generations. Find both in My artwork, even after leaving this page.",
                    "分别生成两张单语海报，依次完成，计 2 次生成。离开页面后仍可在「我的作品」查看。",
                  )
                : t(
                    "One finished image. Find it in My artwork after leaving this page.",
                    "生成一张单语海报，可离开页面后在「我的作品」查看。",
                  )}
            </p>
            <p className="studio-note">
              {t(
                `Up to ${settings?.dailyLimit || 10} generations per day. Review text and portrait details before sharing.`,
                `每日最多 ${settings?.dailyLimit || 10} 次。分享前请检查文字和头像细节。`,
              )}
            </p>
            {settings &&
              (!settings.azureConfigured || !settings.storageConfigured) && (
                <p className="studio-error">
                  {t(
                    "An administrator needs to finish image service and storage setup.",
                    "管理员需要完成图片服务与存储配置。",
                  )}
                </p>
              )}
          </aside>
        </div>
      )}
    </div>
  );
}
