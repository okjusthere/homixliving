"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, LoaderCircle, Mail, Search } from "lucide-react";
import { useLocale } from "@/lib/i18n-client";
import { PageHeader } from "@/components/homix/page-kit";
import { contentFetch, Field } from "./ui";
import { ContentErrorDialog } from "./error-dialog";

type Campaign = {
  id: string;
  name: string;
  status: string;
  version: number;
  subject: string;
  preheader: string | null;
  introText: string | null;
  ctaLabel: string;
  ctaUrl: string | null;
  lastTestedVersion: number | null;
  lastSuccessfulTestAt: string | null;
  scheduledAt: string | null;
  audienceCount: number;
  updatedAt: string;
  listing: { address: string; status: string } | null;
  marketingIdentity: { name: string; email: string; companyName: string };
  sender: {
    name: string;
    email: string;
    dailyLimit: number;
    batchSize?: number;
    minBatchIntervalSeconds?: number;
    timezone?: string;
    sendWindowStart?: string;
    sendWindowEnd?: string;
    allowedWeekdays?: number[];
    nextBatchAt: string | null;
  };
  stats: Record<string, number>;
};
type Listing = {
  sourceKey: string;
  unparsedAddress: string;
  listPrice?: number;
  standardStatus?: string;
};
type Proposal = {
  generationId: string;
  version: number;
  proposal: {
    variants: {
      subject: string;
      preheader: string;
      introText: string;
      ctaLabel: string;
    }[];
    recommendedIndex: number;
  };
};
type Copy = {
  subject: string;
  preheader: string;
  introText: string;
  ctaLabel: string;
  ctaUrl: string;
};
const emptyCopy: Copy = {
  subject: "",
  preheader: "",
  introText: "",
  ctaLabel: "View Listing",
  ctaUrl: "",
};
const base = "/api/marketing/email";
const editable = (c: Campaign | null) => c?.status === "DRAFT";
const copyOf = (c: Campaign): Copy => ({
  subject: c.subject,
  preheader: c.preheader || "",
  introText: c.introText || "",
  ctaLabel: c.ctaLabel,
  ctaUrl: c.ctaUrl || "",
});

export function EmailWorkspace() {
  const zh = useLocale() === "zh",
    t = (en: string, cn: string) => (zh ? cn : en);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]),
    [campaign, setCampaign] = useState<Campaign | null>(null),
    [copy, setCopy] = useState<Copy>(emptyCopy);
  const [settings, setSettings] = useState<{
    email: string;
    deliveryMode: string;
    selfTestAllowed: boolean;
  } | null>(null);
  const [query, setQuery] = useState(""),
    [listings, setListings] = useState<Listing[]>([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(""),
    [proposal, setProposal] = useState<Proposal | null>(null),
    [summary, setSummary] = useState<Record<string, number> | null>(null),
    [scheduled, setScheduled] = useState(""),
    [confirm, setConfirm] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const [radius, setRadius] = useState(3),
    [months, setMonths] = useState(12),
    [page, setPage] = useState(0),
    [hasMore, setHasMore] = useState(false);
  const actionKeys = useRef<Record<string, string>>({});
  const dirty =
    !!campaign && JSON.stringify(copy) !== JSON.stringify(copyOf(campaign));
  const load = useCallback(async () => {
    const data = await contentFetch<{
      campaigns: Campaign[];
      hasMore: boolean;
    }>(`${base}/campaigns`);
    setCampaigns(data.campaigns);
    setHasMore(data.hasMore);
    setPage(0);
  }, []);
  useEffect(() => {
    let live = true;
    Promise.allSettled([
      contentFetch<NonNullable<typeof settings>>(`${base}/status`),
      load(),
    ]).then((results) => {
      if (!live) return;
      const a = results[0];
      if (a.status === "fulfilled") setSettings(a.value);
      const failed = results.find((r) => r.status === "rejected");
      if (failed?.status === "rejected") setError(failed.reason.message);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [load]);
  const select = (c: Campaign) => {
    setConfirmDelete(false);
    setCampaign(c);
    setCopy(copyOf(c));
    setPreview("");
    setSummary(null);
    setProposal(null);
    setConfirm(false);
    setNotice("");
    setError("");
    setScheduled("");
  };
  const refresh = useCallback(async (id: string) => {
    const data = await contentFetch<{ campaign: Campaign }>(
      `${base}/campaigns/${id}`,
    );
    setCampaign((current) => (current?.id === id ? data.campaign : current));
    return data.campaign;
  }, []);
  useEffect(() => {
    if (
      !campaign ||
      campaign.status === "DRAFT" ||
      ["COMPLETED", "CANCELLED", "FAILED"].includes(campaign.status)
    )
      return;
    const id = campaign.id,
      timer = setInterval(
        () => refresh(id).catch((e) => setError(e.message)),
        8000,
      );
    return () => clearInterval(timer);
  }, [campaign, refresh]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function post<T>(
    path: string,
    body: Record<string, unknown> = {},
    stable = false,
  ) {
    const identity = path + JSON.stringify(body);
    if (stable) actionKeys.current[identity] ??= crypto.randomUUID();
    const data = await contentFetch<T>(base + path, {
      method: "POST",
      body: JSON.stringify({
        ...body,
        ...(stable ? { clientRequestId: actionKeys.current[identity] } : {}),
      }),
    });
    if (stable) delete actionKeys.current[identity];
    return data;
  }
  async function save() {
    if (!campaign) return;
    const data = await contentFetch<{ campaign: Campaign }>(
      `${base}/campaigns/${campaign.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          ...copy,
          ctaUrl: copy.ctaUrl || undefined,
          version: campaign.version,
        }),
      },
    );
    setCampaign(data.campaign);
    setCopy(copyOf(data.campaign));
    setPreview("");
    setProposal(null);
    setNotice(
      t(
        "Draft saved. Send a new test before publishing.",
        "草稿已保存，发布前请重新发送测试邮件。",
      ),
    );
  }
  async function operation(
    action: string,
    body: Record<string, unknown> = {},
    stable = false,
  ) {
    if (!campaign) return;
    const data = await post<{ campaign: Campaign }>(
      `/campaigns/${campaign.id}/${action}`,
      body,
      stable,
    );
    setCampaign(data.campaign);
    setCopy(copyOf(data.campaign));
    setConfirm(false);
  }
  const state = (s: string) =>
    zh
      ? {
          DRAFT: "草稿",
          READY: "待发送",
          SNAPSHOTTING: "准备收件人",
          SCHEDULED: "已定时",
          QUEUED: "排队中",
          SENDING: "发送中",
          PAUSED: "已暂停",
          COMPLETED: "已完成",
          CANCELLED: "已取消",
          FAILED: "失败",
        }[s] || s
      : s.replaceAll("_", " ");
  return (
    <div className="studio">
      <PageHeader
        eyebrow="HOMIX / PERSONAL MARKETING"
        title={t("Email marketing", "邮件推广")}
        description={t(
          "Introduce a property to agents with nearby closed transactions.",
          "把房源介绍给周边有成交记录的经纪人。",
        )}
        actions={
          campaign ? (
            <button
              className="studio-button secondary"
              disabled={busy || dirty}
              onClick={() =>
                act(async () => {
                  setCampaign(null);
                  await load();
                })
              }
            >
              <ArrowLeft size={15} />
              {t("All campaigns", "全部活动")}
            </button>
          ) : undefined
        }
      />
      <ContentErrorDialog
        message={error}
        zh={zh}
        onClose={() => setError("")}
      />
      {notice && (
        <p className="studio-note" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <div className="studio-empty">
          <LoaderCircle className="animate-spin" />
          {t("Loading email workspace…", "正在加载邮件工作台…")}
        </div>
      ) : !campaign ? (
        <>
          <section className="studio-section">
            <div className="studio-kicker">
              01 / {t("Start with a property", "从房源开始")}
            </div>
            <h2>{t("Find your listing", "查找房源")}</h2>
            <form
              className="studio-row studio-email-search"
              onSubmit={(e) => {
                e.preventDefault();
                act(async () => {
                  const data = await contentFetch<{ items: Listing[] }>(
                    `${base}/listings?query=${encodeURIComponent(query.trim())}`,
                  );
                  setListings(data.items);
                  if (!data.items.length)
                    setNotice(t("No matching listings.", "没有找到匹配房源。"));
                });
              }}
            >
              <Field label={t("MLS number or address", "MLS 编号或地址")}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  minLength={2}
                  maxLength={200}
                  placeholder="MLS / Address"
                  required
                />
              </Field>
              <button
                className="studio-button"
                disabled={busy || query.trim().length < 2}
              >
                <Search size={15} />
                {t("Search", "搜索")}
              </button>
            </form>
            {listings.map((l) => (
              <button
                className="studio-topic w-full mt-3"
                key={l.sourceKey}
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const data = await post<{ campaign: Campaign }>(
                      "/campaigns",
                      { sourceKey: l.sourceKey },
                      true,
                    );
                    select(data.campaign);
                  })
                }
              >
                <span>
                  {l.unparsedAddress}
                  <small>
                    {l.sourceKey} · {l.standardStatus}
                    {l.listPrice ? ` · $${l.listPrice.toLocaleString()}` : ""}
                  </small>
                </span>
              </button>
            ))}
          </section>
          <section className="studio-section">
            <h2>{t("Your campaigns", "推广活动")}</h2>
            {!campaigns.length ? (
              <p className="studio-note">
                {t(
                  "Choose a listing to prepare your first email.",
                  "选择一个房源，开始准备第一封推广邮件。",
                )}
              </p>
            ) : (
              <div className="studio-works">
                {campaigns.map((c) => (
                  <button
                    className="studio-work text-left"
                    key={c.id}
                    onClick={() => select(c)}
                  >
                    <div className="studio-work-body">
                      <div className="studio-kicker">{state(c.status)}</div>
                      <h3>{c.listing?.address || c.name}</h3>
                      <p className="studio-note">{c.subject}</p>
                      <p className="studio-note">
                        {t("Delivered", "已送达")} {c.stats.deliveredCount} /{" "}
                        {c.stats.targetCount} ·{" "}
                        {new Date(c.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {hasMore && (
              <button
                className="studio-button secondary mt-6"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const next = page + 1,
                      data = await contentFetch<{
                        campaigns: Campaign[];
                        hasMore: boolean;
                      }>(`${base}/campaigns?page=${next}`);
                    setCampaigns((v) => [...v, ...data.campaigns]);
                    setPage(next);
                    setHasMore(data.hasMore);
                  })
                }
              >
                {t("Load more", "加载更多")}
              </button>
            )}
          </section>
        </>
      ) : (
        <div className="studio-grid">
          <main>
            <section className="studio-section">
              <div className="studio-kicker">{state(campaign.status)}</div>
              <h2>{campaign.listing?.address || campaign.name}</h2>
              <p className="studio-note">
                {t("From", "发件人")}: {campaign.sender.name} &lt;
                {campaign.sender.email}&gt;
                <br />
                {t("Signature & replies", "署名及回复")}:{" "}
                {campaign.marketingIdentity.name} ·{" "}
                {campaign.marketingIdentity.email}
              </p>
              <Field label={t("Subject", "邮件主题")}>
                <input
                  disabled={!editable(campaign) || busy}
                  value={copy.subject}
                  maxLength={150}
                  onChange={(e) =>
                    setCopy({ ...copy, subject: e.target.value })
                  }
                />
              </Field>
              <Field label={t("Preheader", "摘要")}>
                <input
                  disabled={!editable(campaign) || busy}
                  value={copy.preheader}
                  maxLength={200}
                  onChange={(e) =>
                    setCopy({ ...copy, preheader: e.target.value })
                  }
                />
              </Field>
              <Field label={t("Message", "正文")}>
                <textarea
                  disabled={!editable(campaign) || busy}
                  rows={8}
                  value={copy.introText}
                  maxLength={10000}
                  onChange={(e) =>
                    setCopy({ ...copy, introText: e.target.value })
                  }
                />
              </Field>
              <div className="studio-row">
                <Field label={t("Button text", "按钮文字")}>
                  <input
                    disabled={!editable(campaign) || busy}
                    value={copy.ctaLabel}
                    maxLength={80}
                    onChange={(e) =>
                      setCopy({ ...copy, ctaLabel: e.target.value })
                    }
                  />
                </Field>
                <Field label={t("Listing link", "房源链接")}>
                  <input
                    type="url"
                    disabled={!editable(campaign) || busy}
                    value={copy.ctaUrl}
                    onChange={(e) =>
                      setCopy({ ...copy, ctaUrl: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="studio-row">
                {editable(campaign) && (
                  <>
                    <button
                      className="studio-button"
                      disabled={busy || !dirty || !copy.subject}
                      onClick={() => act(save)}
                    >
                      {t("Save draft", "保存草稿")}
                    </button>
                    <button
                      className="studio-button secondary"
                      disabled={busy || dirty}
                      onClick={() =>
                        act(async () => {
                          const data = await post<Omit<Proposal, "version">>(
                            `/campaigns/${campaign.id}/ai`,
                            { tone: "professional" },
                          );
                          setProposal({ ...data, version: campaign.version });
                        })
                      }
                    >
                      {t("Suggest copy", "AI 文案建议")}
                    </button>
                  </>
                )}
                <button
                  className="studio-button secondary"
                  disabled={busy || dirty}
                  onClick={() =>
                    act(async () => {
                      const data = await post<{ html: string }>(
                        `/campaigns/${campaign.id}/preview`,
                      );
                      setPreview(data.html);
                    })
                  }
                >
                  {t("Preview", "预览邮件")}
                </button>
              </div>
              {editable(campaign) && (
                <div className="mt-4">
                  {!confirmDelete ? (
                    <button
                      className="studio-back-link"
                      disabled={busy}
                      onClick={() => setConfirmDelete(true)}
                    >
                      {t("Delete draft", "删除草稿")}
                    </button>
                  ) : (
                    <div
                      role="group"
                      aria-label={t(
                        "Delete draft confirmation",
                        "删除草稿确认",
                      )}
                    >
                      <p>
                        {t(
                          `Delete the draft “${campaign.name}”?`,
                          `确认删除「${campaign.name}」草稿？`,
                        )}
                      </p>
                      <div className="studio-row">
                        <button
                          className="studio-button secondary"
                          disabled={busy}
                          onClick={() =>
                            act(async () => {
                              await contentFetch(
                                `${base}/campaigns/${campaign.id}`,
                                {
                                  method: "DELETE",
                                  body: JSON.stringify({
                                    version: campaign.version,
                                  }),
                                },
                              );
                              setCampaign(null);
                              setConfirmDelete(false);
                              setPreview("");
                              await load();
                              setNotice(t("Draft deleted.", "草稿已删除。"));
                            })
                          }
                        >
                          {t("Confirm deletion", "确认删除")}
                        </button>
                        <button
                          className="studio-button secondary"
                          disabled={busy}
                          onClick={() => setConfirmDelete(false)}
                        >
                          {t("Keep draft", "保留草稿")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {dirty && (
                <p className="studio-note">
                  {t(
                    "Save your changes to preview, test or send.",
                    "请先保存修改，再预览、测试或发送。",
                  )}
                </p>
              )}
              {proposal && (
                <div className="mt-6">
                  <h3>{t("Choose a suggestion", "选择文案建议")}</h3>
                  {proposal.proposal.variants.map((v, i) => (
                    <article className="studio-section" key={i}>
                      <h3>{v.subject}</h3>
                      <p className="studio-note">{v.preheader}</p>
                      <p className="whitespace-pre-wrap">{v.introText}</p>
                      <button
                        className="studio-button secondary"
                        disabled={
                          busy || dirty || proposal.version !== campaign.version
                        }
                        onClick={() =>
                          act(async () => {
                            await operation("ai-apply", {
                              version: proposal.version,
                              generationId: proposal.generationId,
                              variantIndex: i,
                              fields: [
                                "subject",
                                "preheader",
                                "introText",
                                "ctaLabel",
                              ],
                            });
                            setProposal(null);
                            setPreview("");
                          })
                        }
                      >
                        {t("Apply suggestion", "采用此版本")}
                      </button>
                    </article>
                  ))}
                </div>
              )}
              {preview && (
                <iframe
                  title={t("Email preview", "邮件预览")}
                  srcDoc={preview}
                  sandbox=""
                  referrerPolicy="no-referrer"
                  className="w-full min-h-[680px] border-0 mt-6"
                />
              )}
            </section>
            <section className="studio-section">
              <h2>{t("Delivery progress", "发送进度")}</h2>
              <div className="studio-topics">
                {[
                  ["targetCount", "Recipients", "收件人"],
                  ["acceptedCount", "Sent", "已发送"],
                  ["deliveredCount", "Delivered", "已送达"],
                  ["openedCount", "Opened", "已打开"],
                  ["clickedCount", "Clicked", "已点击"],
                  ["bouncedCount", "Bounced", "退信"],
                  ["failedCount", "Failed", "失败"],
                ].map(([key, en, cn]) => (
                  <div className="studio-topic" key={key}>
                    <span>
                      {campaign.stats[key] || 0}
                      <small>{t(en, cn)}</small>
                    </span>
                  </div>
                ))}
              </div>
              <p className="studio-note">
                {t("Sender daily limit", "发件人每日上限")}:{" "}
                {campaign.sender.dailyLimit}.{" "}
                {campaign.sender.nextBatchAt
                  ? `${t("Next available batch", "下一批时间")}: ${new Date(campaign.sender.nextBatchAt).toLocaleString()}`
                  : ""}
              </p>
              {campaign.sender.batchSize !== undefined && (
                <p className="studio-note">
                  {t(
                    `Up to ${campaign.sender.batchSize} emails per batch, at least ${campaign.sender.minBatchIntervalSeconds} seconds apart. Sending window: ${campaign.sender.sendWindowStart}–${campaign.sender.sendWindowEnd} (${campaign.sender.timezone}).`,
                    `每批最多 ${campaign.sender.batchSize} 封，批次间隔至少 ${campaign.sender.minBatchIntervalSeconds} 秒。发送时段：${campaign.sender.sendWindowStart}–${campaign.sender.sendWindowEnd}（${campaign.sender.timezone}）。`,
                  )}
                  {t(" Sending days: ", " 发送星期：")}
                  {campaign.sender.allowedWeekdays
                    ?.map(
                      (d) =>
                        (zh
                          ? ["日", "一", "二", "三", "四", "五", "六"]
                          : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])[
                          d
                        ],
                    )
                    .join("、")}
                </p>
              )}
              <p className="studio-note">
                {t(
                  "Email Service controls this sender’s limits and schedule. Campaigns sharing this sender also share its capacity; an administrator can adjust the sender settings.",
                  "发送额度和时段由 Email Service 统一管理，同一发件邮箱的活动共享额度；管理员可在服务中调整发件人设置。",
                )}
              </p>
              <p className="studio-note">
                {t(
                  "Scheduled time is the earliest start; sender pacing and suppression rules still apply.",
                  "定时时间是最早开始时间，实际发送仍遵循发件频率和收件人排除规则。",
                )}
              </p>
              <div className="studio-row">
                {(campaign.status === "SENDING" ||
                  campaign.status === "PAUSED") && (
                  <button
                    className="studio-button secondary"
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        operation(
                          campaign.status === "PAUSED" ? "resume" : "pause",
                        ),
                      )
                    }
                  >
                    {campaign.status === "PAUSED"
                      ? t("Resume", "继续发送")
                      : t("Pause", "暂停")}
                  </button>
                )}
                {["READY", "SCHEDULED", "QUEUED", "SENDING", "PAUSED"].includes(
                  campaign.status,
                ) && (
                  <button
                    className="studio-button secondary"
                    disabled={busy}
                    onClick={() => act(() => operation("cancel"))}
                  >
                    {t("Cancel remaining emails", "取消剩余邮件")}
                  </button>
                )}
              </div>
            </section>
          </main>
          <aside>
            <section className="studio-section">
              <div className="studio-kicker">
                02 / {t("Your audience", "目标收件人")}
              </div>
              <h2>
                {campaign.audienceCount} {t("agents", "位经纪人")}
              </h2>
              <p className="studio-note">
                {t(
                  "Agents with closed transactions in this ZIP and nearby ZIP codes.",
                  "房源所在及附近邮编区域内，有成交记录的经纪人。",
                )}
              </p>
              <div className="studio-row">
                <Field label={t("Nearby ZIP codes", "附近邮编数量")}>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    disabled={!editable(campaign) || busy}
                    value={radius}
                    onChange={(e) => setRadius(Number(e.target.value))}
                  />
                </Field>
                <Field label={t("Past months", "过去月数")}>
                  <input
                    type="number"
                    min={1}
                    max={36}
                    disabled={!editable(campaign) || busy}
                    value={months}
                    onChange={(e) => setMonths(Number(e.target.value))}
                  />
                </Field>
              </div>
              <button
                className="studio-button secondary"
                disabled={busy || dirty || !editable(campaign)}
                onClick={() =>
                  act(async () => {
                    const data = await post<{
                      campaign: Campaign;
                      summary: Record<string, number>;
                    }>(`/campaigns/${campaign.id}/nearby`, {
                      version: campaign.version,
                      nearbyZipCount: radius,
                      closedMonths: months,
                    });
                    setCampaign(data.campaign);
                    setSummary(data.summary);
                  })
                }
              >
                {t("Find recipients", "查找收件人")}
              </button>
              {summary && (
                <p className="studio-note">
                  {t("Matched", "匹配")} {summary.matched} ·{" "}
                  {t("Eligible", "可发送")} {summary.eligible} ·{" "}
                  {t("Suppressed", "已排除")} {summary.suppressed}
                </p>
              )}
            </section>
            {editable(campaign) && (
              <section className="studio-section">
                <div className="studio-kicker">
                  03 / {t("Review & send", "检查与发送")}
                </div>
                <p className="studio-note">
                  {t("Test recipient", "测试收件人")}: {settings?.email || "—"}
                </p>
                {settings && !settings.selfTestAllowed && (
                  <p className="studio-note">
                    {t(
                      "Ask the Email Service administrator to enable your address for test sends.",
                      "请邮件服务管理员将你的邮箱加入测试收件人名单。",
                    )}
                  </p>
                )}
                <button
                  className="studio-button secondary"
                  disabled={busy || dirty || !settings?.selfTestAllowed}
                  onClick={() =>
                    act(async () => {
                      await operation(
                        "test",
                        { version: campaign.version },
                        true,
                      );
                      setNotice(
                        t(
                          "Test email sent to your account.",
                          "测试邮件已发送到你的邮箱。",
                        ),
                      );
                    })
                  }
                >
                  <Mail size={15} />
                  {t("Send test to myself", "发给自己测试")}
                </button>
                <p className="studio-note">
                  {campaign.lastTestedVersion === campaign.version &&
                  campaign.lastSuccessfulTestAt
                    ? t(
                        "Current version tested successfully.",
                        "当前版本测试成功。",
                      )
                    : t(
                        "A successful test of the current version is required.",
                        "需要先成功测试当前版本。",
                      )}
                </p>
                <Field
                  label={t(
                    "Schedule (your local time; optional)",
                    "定时发送（本地时间，可留空）",
                  )}
                >
                  <input
                    type="datetime-local"
                    value={scheduled}
                    disabled={busy}
                    onChange={(e) => {
                      setScheduled(e.target.value);
                      setConfirm(false);
                    }}
                  />
                </Field>
                <button
                  className="studio-button"
                  disabled={
                    busy ||
                    dirty ||
                    !campaign.audienceCount ||
                    campaign.lastTestedVersion !== campaign.version ||
                    !campaign.lastSuccessfulTestAt
                  }
                  onClick={() => setConfirm(true)}
                >
                  {scheduled
                    ? t("Review scheduled send", "检查定时发送")
                    : t("Review send", "检查发送")}
                </button>
                {confirm && (
                  <div
                    className="mt-6"
                    role="group"
                    aria-label={t("Confirm send", "确认发送")}
                  >
                    <p>
                      {t(
                        "Send this saved email to the selected audience?",
                        "确认向所选收件人发送当前已保存的邮件？",
                      )}
                    </p>
                    <p className="studio-note">
                      {campaign.subject}
                      <br />
                      {campaign.audienceCount}{" "}
                      {t("eligible recipients", "位可发送收件人")}
                      <br />
                      {scheduled
                        ? new Date(scheduled).toLocaleString()
                        : t(
                            "Start as soon as sender capacity allows",
                            "按发送配额尽快开始",
                          )}
                    </p>
                    <div className="studio-row">
                      <button
                        className="studio-button"
                        disabled={busy}
                        onClick={() =>
                          act(() =>
                            operation(
                              "publish",
                              {
                                version: campaign.version,
                                ...(scheduled
                                  ? {
                                      scheduledAt: new Date(
                                        scheduled,
                                      ).toISOString(),
                                    }
                                  : {}),
                              },
                              true,
                            ),
                          )
                        }
                      >
                        {t("Confirm send", "确认发送")}
                      </button>
                      <button
                        className="studio-button secondary"
                        disabled={busy}
                        onClick={() => setConfirm(false)}
                      >
                        {t("Go back", "返回")}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </aside>
        </div>
      )}
      {busy && (
        <p role="status" className="studio-note flex items-center gap-2">
          <LoaderCircle size={15} className="animate-spin" />
          {t("Working…", "正在处理…")}
        </p>
      )}
    </div>
  );
}
