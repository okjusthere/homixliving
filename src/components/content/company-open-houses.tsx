"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n-client";
import { generationErrorGuidance } from "@/lib/content/error-guidance";
import type { Generation } from "@/lib/content/types";
import { contentFetch } from "./ui";
import { ContentErrorDialog } from "./error-dialog";
import type { CompanyOpenHouse, OpenHouseJob } from "@/lib/content/company-open-house";

const endpoint = "/api/content/office/open-houses";
function jobError(job: OpenHouseJob, zh: boolean) { return job.generationId ? generationErrorGuidance(job.error, job.status as Generation["status"], zh) : job.error; }
function schedule(date: string, start: string, end: string) {
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const time = (value: string) => { const [h, m] = value.split(":"); return `${Number(h) % 12 || 12}${m === "00" ? "" : `:${m}`} ${Number(h) < 12 ? "AM" : "PM"}`; };
  return `${day} · ${time(start)}–${time(end)}`;
}
export function CompanyOpenHouses() {
  const zh = useLocale() === "zh", t = (en: string, cn: string) => zh ? cn : en;
  const [items, setItems] = useState<CompanyOpenHouse[]>([]);
  const [jobs, setJobs] = useState<OpenHouseJob[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const errorsSeen = useRef(new Set<string>());
  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await contentFetch<{ items: CompanyOpenHouse[]; jobs: OpenHouseJob[] }>(endpoint); setItems(data.items); setJobs(data.jobs); }
    catch (e) { setError(e instanceof Error ? e.message : "读取公展失败，请刷新重试。"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let disposed = false, running = false;
    const timer = setInterval(async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const data = await contentFetch<{ jobs: OpenHouseJob[] }>(`${endpoint}?jobs=1`);
        if (!disposed) setJobs(data.jobs);
      } catch (e) {
        if (!disposed && !errorsSeen.current.has("poll")) { errorsSeen.current.add("poll"); setError(e instanceof Error ? e.message : "进度更新失败，请刷新重试。"); }
      } finally { running = false; }
    }, 6000);
    return () => { disposed = true; clearInterval(timer); };
  }, []);
  useEffect(() => {
    const visible = new Set(items.map((item) => item.key));
    const failures = jobs.filter((j) => visible.has(j.key) && j.error && !errorsSeen.current.has(`${j.id}:${j.error}`));
    if (failures.length) {
      failures.forEach((j) => errorsSeen.current.add(`${j.id}:${j.error}`));
      setError(failures.map((j) => `${j.address} · ${j.agentName}\n${jobError(j, zh)}`).join("\n\n"));
    }
  }, [items, jobs, zh]);
  const byKey = new Map(jobs.map((j) => [j.key, j]));
  const ready = items.filter((i) => !i.problem && !byKey.has(i.key));
  const blocked = items.filter((i) => i.problem).length;
  async function generate() {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await contentFetch<{ added: number; unchanged: number; changed: number; jobs: OpenHouseJob[] }>(endpoint, { method: "POST", body: JSON.stringify({ keys: ready.map((i) => i.key) }) });
      setJobs(data.jobs);
      setNotice(t(`${data.added} posters queued. You may leave this page.`, `已加入 ${data.added} 张海报，关闭页面后仍会继续制作。`) + (data.unchanged ? t(` ${data.unchanged} already queued.`, ` ${data.unchanged} 张已在队列中，未重复创建。`) : "") + (data.changed ? t(` ${data.changed} listings changed; refresh to review.`, ` ${data.changed} 套房源资料已变化，刷新后即可查看。`) : ""));
      if (data.changed) await load();
    } catch (e) { setError(e instanceof Error ? e.message : "提交失败，请重试。"); }
    finally { setBusy(false); }
  }
  async function retry(id: string) {
    setBusy(true);
    try { const data = await contentFetch<{ jobs: OpenHouseJob[] }>(endpoint, { method: "POST", body: JSON.stringify({ retryId: id }) }); setJobs(data.jobs); }
    catch (e) { setError(e instanceof Error ? e.message : "重试失败，请刷新。"); }
    finally { setBusy(false); }
  }
  const labels: Record<string, string> = { queued: t("Queued", "排队中"), preparing: t("Preparing", "准备资料中"), submitted: t("Queued", "已加入队列"), generating: t("Generating", "生成中"), saving: t("Saving", "保存中"), succeeded: t("Complete", "已完成"), failed: t("Needs attention", "生成失败"), needs_review: t("Needs review", "需要检查") };
  return <section className="company-open-houses">
    <div className="company-oh-heading"><div><h2>{t("Company Open Houses", "公司公展一键制作")}</h2><p>{t("Upcoming MLS Open Houses only. Each poster uses its Listing Agent and exact schedule.", "仅显示 MLS 已设置、尚未结束的公司公展。自动对应 Listing Agent 和每套房源的准确时间。")}</p></div>
      <button className="studio-button secondary" disabled={loading || busy} onClick={load}>{loading ? t("Loading…", "读取中…") : t("Refresh listings", "刷新房源")}</button>
    </div>
    <div className="company-oh-action"><div><strong>{t(`${items.length} Open House properties`, `${items.length} 套公展房源`)}</strong><p>{t("Chinese · Homix Classic · up to 5 factual highlights, including verified property tax", "中文 · Homix 经典 · 最多 5 条真实亮点，优先包含已提供的地税")}</p></div><button className="studio-button" disabled={loading || busy || !ready.length} onClick={generate}>{busy ? t("Submitting…", "正在提交…") : ready.length ? t(`Generate all · ${ready.length}`, `一键生成全部 · ${ready.length} 张`) : t("No new posters to generate", "暂无待生成海报")}</button></div>
    {notice && <p role="status" className="studio-note">{notice}</p>}
    {blocked > 0 && <p className="studio-note">{t(`${blocked} properties need the details shown below. Other posters can still be generated.`, `${blocked} 套房源需补充下方标出的资料，不影响其他海报生成。`)}</p>}
    {!loading && !items.length && <p className="company-oh-empty">{t("No upcoming company Open Houses in MLS. Set the schedule in MLS, then refresh here.", "目前没有 MLS 已设置的有效公司公展。在 MLS 添加公展安排后，刷新即可显示。")}</p>}
    <div className="company-oh-list">{items.map((item) => {
      const job = byKey.get(item.key);
      return <article className="company-oh-property" key={item.key}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {item.listing.photos[0]?.url ? <img src={item.listing.photos[0].url} alt="" loading="lazy" /> : <div className="company-oh-no-photo">{t("No photo", "暂无照片")}</div>}
        <div className="company-oh-details"><h3>{item.listing.address.full}</h3><p>{item.agent?.name || item.listing.listAgentName || t("Agent not linked", "经纪人未匹配")} · Listing Agent</p><ul>{item.events.map((event) => <li key={`${event.date}:${event.start}`}>{schedule(event.date, event.start, event.end)}</li>)}</ul>
          {(item.problem || job?.error) && <p className="company-oh-problem">{item.problem || (job && jobError(job, zh))}</p>}
        </div>
        <div className="company-oh-result"><span role="status">{job ? labels[job.status] || job.status : item.problem ? t("Needs details", "待补资料") : t("Ready", "可生成")}</span>
          {job?.outputAssetId && <a className="studio-button secondary" href={`/api/content/assets/${job.outputAssetId}`} target="_blank" rel="noreferrer">{t("View poster", "查看海报")}</a>}
          {job?.status === "failed" && !job.generationId && <button className="studio-button secondary" disabled={busy} onClick={() => retry(job.id)}>{t("Retry", "重试")}</button>}
          {job?.generationId && ["failed", "needs_review"].includes(job.status) && <Link href="?tab=production">{t("Review in workbench", "到制作工作台检查")}</Link>}
        </div>
      </article>;
    })}</div>
    <p className="studio-note">{t("Need a different hosting Agent? Use Poster production. Repeated clicks do not duplicate existing posters.", "需要伙伴代班的海报，请使用「海报制作」。已提交的相同海报不会重复生成。")}</p>
    <ContentErrorDialog message={error} onClose={() => setError("")} zh={zh} />
  </section>;
}
