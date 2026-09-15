"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated content assets. */
import { useCallback, useEffect, useRef, useState } from "react";
import { officeDefaults, readOfficeDefaults, officeDraftProblems, type OfficeDefaults } from "@/lib/content/office-production";
import { OfficeSubjectCard } from "./office-subject-card";
import { OfficeListingImport } from "./office-listing-import";
import { confirmPosterCopy } from "@/lib/content/copy-review";
import { ContentStudio } from "./studio";
import { contentFetch, Field } from "./ui";
import { ContentErrorDialog } from "./error-dialog";
import { useLocale } from "@/lib/i18n-client";
import { generationErrorGuidance } from "@/lib/content/error-guidance";
import { LISTING_THEMES, type ContentInput, type ContentTemplate } from "@/lib/content/types";
import type { OfficeTask, OfficeRequest, OfficeGeneration } from "@/lib/content/office-types";

type AgentChoice = { id: number; name: string; email: string; phone?: string };
export function OfficeWorkbench() {
  const zh = useLocale() === "zh";
  const t = (en: string, cn: string) => zh ? cn : en;
  const requestRevision = useRef(0);
  const [counts, setCounts] = useState({ drafts: 0, queue: 0, artwork: 0 });
  const reportedFailures = useRef(new Set<string>());
  const refreshError = useRef("");
  const currentDraft = useRef<OfficeRequest | undefined>(undefined);
  const topicLabel = (input: ContentInput) => LISTING_THEMES.find((v) => v.id === input.theme)?.[zh ? "zh" : "en"] || (input.kind === "custom" ? t("Freeform poster", "自由创作") : t("Holiday greeting", "节日祝福"));
  const languageLabel = (value: string) => value === "zh" ? "中文" : "English";
  const [tasks, setTasks] = useState<OfficeTask[]>([]);
  const [outputs, setOutputs] = useState<OfficeGeneration[]>([]);
  const [agents, setAgents] = useState<AgentChoice[]>([]);
  const [search, setSearch] = useState("");
  const [agent, setAgent] = useState<AgentChoice | null>(null);
  const [editor, setEditor] = useState<{ key: string; taskId?: string; request?: OfficeRequest } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [changingAgent, setChangingAgent] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [defaults, setDefaults] = useState<OfficeDefaults>(officeDefaults);
  useEffect(() => { try { setDefaults(readOfficeDefaults(sessionStorage.getItem("office-poster-defaults"))); } catch { /* Storage is optional. */ } }, []);
  function updateDefaults(value: OfficeDefaults) { setDefaults(value); try { sessionStorage.setItem("office-poster-defaults", JSON.stringify(value)); } catch { /* Storage is optional. */ } }
  function chooseAgent(value: AgentChoice) { setAgent(value); setChangingAgent(false); setChoosing(true); setView("drafts"); setPage(0); }
  const [view, setView] = useState<"drafts" | "queue" | "artwork">("drafts");
  const [checked, setChecked] = useState<string[]>([]);
  const [selectedOutputs, setSelectedOutputs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [batchLanguage, setBatchLanguage] = useState("");
  const [batchTheme, setBatchTheme] = useState("");
  const [batchStyle, setBatchStyle] = useState("");
  const reload = useCallback(async () => {
    const revision = ++requestRevision.current;
    const data = await contentFetch<{ tasks: OfficeTask[]; generations: OfficeGeneration[]; hasMore: boolean; counts: typeof counts }>(`/api/content/office?page=${page}&view=${view}`);
    if (revision !== requestRevision.current) return;
    setCounts(data.counts);
    setTasks(data.tasks); setOutputs(data.generations); setHasMore(data.hasMore);
    refreshError.current = "";
    const failures = data.generations.filter((g) => ["failed", "needs_review"].includes(g.status) && g.error !== "CANCELLED_BY_USER" && !reportedFailures.current.has(g.id));
    for (const g of failures) reportedFailures.current.add(g.id);
    if (failures.length) setError(failures.map((g) => `${g.brand.name} · ${g.input.listing?.address || g.input.theme}: ${generationErrorGuidance(g.error, g.status, zh)}`).join("\n"));
  }, [page, view, zh]);
  useEffect(() => { reload().catch((e) => setError(e.message)); }, [reload]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      contentFetch<{ agents: AgentChoice[] }>(`/api/content/office?agents=1&q=${encodeURIComponent(search)}`, { signal: controller.signal })
        .then((r) => setAgents(r.agents)).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search]);
  useEffect(() => {
    const timer = setInterval(() => reload().catch((e) => { if (refreshError.current !== e.message) { refreshError.current = e.message; setError(e.message); } }), 8000);
    return () => clearInterval(timer);
  }, [reload]);
  const drafts = tasks.filter((task) => !task.generationId);
  const selectedTasks = drafts.filter((task) => checked.includes(task.id));
  const count = selectedTasks.reduce((sum, task) => sum + task.request.languages.length, 0);
  const chosenArtwork = outputs.filter((g) => selectedOutputs.includes(g.id) && g.status === "succeeded");
  const pendingArtwork = chosenArtwork.filter((g) => g.reviewStatus === "pending");
  const deliverableArtwork = chosenArtwork.filter((g) => g.reviewStatus === "approved");
  const downloadableArtwork = chosenArtwork.filter((g) => ["approved", "delivered"].includes(g.reviewStatus));
  const blockedTasks = selectedTasks.filter((task) => officeDraftProblems(task.request.input, zh).length);
  const running = outputs.filter((g) => ["queued", "preparing", "generating", "saving"].includes(g.status));
  const artwork = outputs.filter((g) => !["queued", "preparing", "generating", "saving"].includes(g.status));
  async function act(fn: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }
  async function submitSelected() {
    const errors: Record<string, string> = {};
    let sent = 0;
    for (const task of selectedTasks) {
      try {
        const problems = officeDraftProblems(task.request.input, zh);
        if (problems.length) throw new Error(problems.join("; "));
        const confirmed = confirmPosterCopy(task.request.input);
        if (confirmed !== task.request.input) await contentFetch("/api/content/office", { method: "POST", body: JSON.stringify({ id: task.id, subjectAgentId: task.subjectAgentId, request: { ...task.request, input: confirmed } }) });
        await contentFetch(`/api/content/office/${task.id}`, { method: "POST", body: JSON.stringify({ action: "submit" }) });
        sent += task.request.languages.length;
      } catch (e) { errors[task.id] = e instanceof Error ? e.message : "Unable to submit"; }
    }
    setRowErrors(errors); setChecked(Object.keys(errors));
    setNotice(t(`${sent} images added to the queue. You can keep creating.`, `已将 ${sent} 张海报加入队列，可以继续制作。`));
    if (Object.keys(errors).length) setError(Object.entries(errors).map(([id, msg]) => `${tasks.find((task) => task.id === id)?.agentName} · ${tasks.find((task) => task.id === id)?.request.input.listing?.address || "海报"}: ${msg}`).join("\n"));
    else setView("queue");
  }
  function edit(task: OfficeTask, copy = false, output?: OfficeGeneration) {
    setChoosing(false);
    setAgent({ id: task.subjectAgentId, name: task.agentName, email: "" });
    setEditor({ key: crypto.randomUUID(), taskId: copy ? undefined : task.id, request: output ? { templateId: output.templateId, input: output.input, languages: [output.input.language === "en" ? "en" : "zh"] } : structuredClone(task.request) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function updateRow(task: OfficeTask, change: { theme?: string; language?: string }) {
    const request = structuredClone(task.request);
    if (change.theme) {
      const { templates } = await contentFetch<{ templates: ContentTemplate[] }>("/api/content/templates");
      const old = templates.find((v) => v.id === request.templateId);
      const template = templates.find((v) => v.config.kind === "listing" && v.config.style === (old?.config.style || "editorial") && v.config.themes.includes(change.theme!));
      if (!template) throw new Error(t("No published template for this topic.", "此主题暂无已发布模板。"));
      request.templateId = template.id; request.input.theme = change.theme; request.input.headline = "";
      if (change.theme === "just_sold" && request.input.listing) request.input.listing.price = "";
      if (change.theme === "open_house" && !request.input.events) request.input.events = [];
    }
    if (change.language) request.languages = change.language === "both" ? ["zh", "en"] : [change.language as "zh" | "en"];
    await contentFetch("/api/content/office", { method: "POST", body: JSON.stringify({ id: task.id, subjectAgentId: task.subjectAgentId, request }) });
  }
  async function applyBatch() {
    const { templates } = await contentFetch<{ templates: ContentTemplate[] }>("/api/content/templates");
    const errors: Record<string, string> = {};
    for (const task of selectedTasks) {
      try {
        const request = structuredClone(task.request);
        const old = templates.find((v) => v.id === request.templateId);
        if (batchTheme && request.input.kind === "listing") { request.input.theme = batchTheme; request.input.headline = ""; if (batchTheme === "just_sold" && request.input.listing) request.input.listing.price = ""; }
        if (batchTheme || batchStyle) {
          const style = batchStyle || old?.config.style;
          const template = templates.find((v) => v.config.kind === request.input.kind && v.config.style === style && (v.config.themes.includes("*") || v.config.themes.includes(request.input.theme)));
          if (!template) throw new Error(t("No matching style for this topic; edit this row.", "此主题没有匹配风格，请单独编辑这一行。"));
          request.templateId = template.id;
          if (batchStyle) request.input.stylePrompt = undefined;
        }
        if (batchLanguage) request.languages = batchLanguage === "both" ? ["zh", "en"] : [batchLanguage as "zh" | "en"];
        await contentFetch("/api/content/office", { method: "POST", body: JSON.stringify({ id: task.id, subjectAgentId: task.subjectAgentId, request }) });
      } catch (e) { errors[task.id] = e instanceof Error ? e.message : "Unable to update"; }
    }
    setRowErrors(errors);
    if (Object.keys(errors).length) setError(Object.values(errors).join("\n"));
    else setNotice(t("Selected drafts updated.", "已更新选中的草稿。"));
  }
  async function outputAction(g: OfficeGeneration, action: string) {
    await contentFetch(`/api/content/office/${g.id}`, { method: "POST", body: JSON.stringify({ action }) });
  }
  async function batchOutputAction(action: "approve" | "deliver") {
    const failures: string[] = [];
    for (const g of action === "approve" ? pendingArtwork : deliverableArtwork) {
      try { await outputAction(g, action); } catch (e) { failures.push(`${g.brand.name}: ${e instanceof Error ? e.message : "Request failed"}`); }
    }
    if (failures.length) setError(failures.join("\n"));
    else { setNotice(t("Done.", action === "deliver" ? "已交付到对应经纪人的我的作品。" : "已审核通过。")); }
  }
  async function downloadZip() {
    const response = await fetch("/api/content/office/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: downloadableArtwork.map((g) => g.id) }) });
    if (!response.ok) { const body = await response.json(); throw new Error(body.error); }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a"); link.href = url; link.download = "homix-posters.zip"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const statusLabel = (g: OfficeGeneration) => g.error === "CANCELLED_BY_USER" ? t("Cancelled", "已取消") : ({ queued: t("Queued", "排队中"), preparing: t("Preparing", "准备素材"), generating: t("Generating", "生成中"), saving: t("Saving", "保存中"), succeeded: g.reviewStatus === "delivered" ? t("Delivered", "已交付") : g.reviewStatus === "approved" ? t("Approved", "审核通过") : t("Review image", "待审核"), failed: t("Failed", "失败"), needs_review: t("Confirm provider outcome", "需确认生成结果") }[g.status] || g.status);
  return <div className="office-workbench">
    <ContentErrorDialog zh={zh} message={error} onClose={() => setError("")} />
    {notice && <p role="status" className="studio-note">{notice}</p>}
    {!editor && <>
      <div className="studio-tabs" role="tablist" aria-label={t("Production", "制作流程")}>
        {(["drafts", "queue", "artwork"] as const).map((v) => <button role="tab" aria-selected={view === v} key={v} onClick={() => { setChoosing(false); setPage(0); setChecked([]); setSelectedOutputs([]); setView(v); }}>{v === "drafts" ? t(`Drafts (${counts.drafts})`, `制作清单（${counts.drafts}）`) : v === "queue" ? t(`Queue (${counts.queue})`, `生成队列（${counts.queue}）`) : t(`Review & artwork (${counts.artwork})`, `审核与成品（${counts.artwork}）`)}</button>)}
      </div>
    </>}
    <section className="studio-section">
      <div className="office-toolbar"><h2>{t("Create for an Agent", "为经纪人制作海报")}</h2>
        {editor && <button className="studio-button secondary" onClick={() => setEditor(null)}>{t("Back to production list", "返回制作清单")}</button>}
      </div>
      {!editor && <>
        {(!agent || changingAgent) ? <>
          <Field label={t("Find an Agent", "选择经纪人")}><input value={search} disabled={importBusy} onChange={(e) => setSearch(e.target.value)} placeholder={t("Name or email", "搜索姓名或邮箱")} /></Field>
          <div className="office-agent-list">{agents.map((a) => <button type="button" disabled={importBusy} className={`office-agent ${agent?.id === a.id ? "selected" : ""}`} aria-pressed={agent?.id === a.id} key={a.id} onClick={() => chooseAgent(a)}><strong>{a.name}</strong><small>{a.email}</small></button>)}</div>
          {agent && <button className="studio-button secondary" onClick={() => setChangingAgent(false)}>{t("Cancel", "取消更换")}</button>}
        </> : <OfficeSubjectCard agent={agent} zh={zh} disabled={importBusy} onChange={() => setChangingAgent(true)} onError={setError} />}
        {agent && !changingAgent && <>
          <div className="office-toolbar">
            <button className="studio-button secondary" disabled={importBusy} onClick={() => { setChoosing(!choosing); setView("drafts"); setPage(0); }}>{choosing ? t("Review saved drafts", "查看已保存草稿") : t("Add more properties", "继续选房制作")}</button>
            <button className="studio-button secondary" disabled={importBusy} onClick={() => { setChoosing(false); setEditor({ key: crypto.randomUUID() }); }}>{t("Single poster / holiday / freeform", "单张精编 / 节日 / 自由创作")}</button>
          </div>
          <div hidden={!choosing}><OfficeListingImport key={agent.id} subjectAgentId={agent.id} agentName={agent.name} zh={zh} defaults={defaults} onDefaults={updateDefaults} onBusy={setImportBusy} onError={setError} onSaved={async (ids, complete) => { setChecked((v) => [...new Set([...v, ...ids])]); setView("drafts"); setPage(0); if (complete) setChoosing(false); setNotice(t(`${ids.length} drafts ready for review.`, `已准备 ${ids.length} 条草稿，请核对后加入队列。`)); await reload(); }} /></div>
        </>}
      </>}
      {editor && agent && <>
        <p className="office-subject">{t("Poster for", "海报经纪人")}：<strong>{agent.name}</strong></p>
        <details className="studio-prompt-editor"><summary>{t("Change Agent", "更换经纪人")}</summary>
          <Field label={t("Search name or email", "搜索姓名或邮箱")}><input value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
          <div className="office-agent-list">{agents.map((a) => <button key={a.id} className="office-agent" onClick={() => { const request = currentDraft.current || editor.request; setAgent(a); setEditor({ key: crypto.randomUUID(), request }); }}><strong>{a.name}</strong><small>{a.email}</small></button>)}</div>
        </details>
        <ContentStudio key={editor.key} office={{ subjectAgentId: agent.id, initialRequest: editor.request, onDraftChange: (request) => { currentDraft.current = request; }, onSave: async (request, generateNow) => {
          const { id } = await contentFetch<{ id: string }>("/api/content/office", { method: "POST", body: JSON.stringify({ id: editor.taskId, subjectAgentId: agent.id, request }) });
          if (generateNow) {
            try { await contentFetch(`/api/content/office/${id}`, { method: "POST", body: JSON.stringify({ action: "submit" }) }); }
            catch (e) {
              setEditor(null); setView("drafts"); setChecked((v) => [...new Set([...v, id])]);
              setError(`${t("Draft saved; check this task before retrying", "草稿已保存，请在清单中检查此任务后重试")}: ${e instanceof Error ? e.message : "Request failed"}`);
              await reload(); return;
            }
          }
          setChecked((v) => generateNow ? v : [...new Set([...v, id])]); setView(generateNow ? "queue" : "drafts"); setEditor(null); setNotice(generateNow ? t("Added to the generation queue.", "已加入生成队列。") : t("Saved. Add another poster or submit the selected drafts.", "已保存。可继续添加海报，或提交选中的草稿。")); await reload();
        } }} />
      </>}
    </section>
    {!editor && !choosing && <>
      {view === "drafts" ? <>
        <div className="office-toolbar">
          <label className="office-check"><input type="checkbox" checked={drafts.length > 0 && drafts.every((task) => checked.includes(task.id))} onChange={(e) => setChecked(e.target.checked ? drafts.map((task) => task.id) : [])} />{t("Select all", "全选")}</label>
          <button disabled={busy || !count} className="studio-button" onClick={() => act(submitSelected)}>{busy ? t("Working…", "处理中…") : t(`Confirm & queue (${count} images)`, `确认文案并加入队列（${count} 张）`)}</button>
        </div>
        {blockedTasks.length > 0 && <p className="studio-note" role="status">{t(`${blockedTasks.length} selected drafts need details. Submission queues only ready drafts and keeps incomplete rows here.`, `选中项中有 ${blockedTasks.length} 条待补资料。提交时只将资料齐全的草稿加入队列，未完成项保留在清单。`)}</p>}
        {selectedTasks.length > 0 && <section aria-label={t("Change selected drafts", "批量修改选中草稿")}>
          <div className="office-batch-controls">
            <Field label={t("Language", "版本")}><select value={batchLanguage} onChange={(e) => setBatchLanguage(e.target.value)}><option value="">{t("Keep current", "保持原设置")}</option><option value="zh">中文</option><option value="en">English</option><option value="both">中文 + English</option></select></Field>
            <Field label={t("Listing theme", "房源主题")}><select value={batchTheme} onChange={(e) => setBatchTheme(e.target.value)}><option value="">{t("Keep current", "保持原设置")}</option>{LISTING_THEMES.map((v) => <option value={v.id} key={v.id}>{zh ? v.zh : v.en}</option>)}</select></Field>
            <Field label={t("Listing style", "房源风格")}><select value={batchStyle} onChange={(e) => setBatchStyle(e.target.value)}><option value="">{t("Keep current", "保持原设置")}</option><option value="editorial">Homix {t("Classic", "经典")}</option><option value="modern">Homix {t("Minimal", "极简")}</option></select></Field>
            <button className="studio-button secondary" disabled={busy} onClick={() => act(applyBatch)}>{t("Apply", "应用")}</button>
          </div>
        </section>}
        {!drafts.length && <p className="studio-empty">{t("Add your first poster above. You can keep adding before starting generation.", "从上方添加第一张海报，可连续添加后统一生成。")}</p>}
        <div className="office-task-list">{drafts.map((task) => <article key={task.id} className="office-task">
          <label className="office-check"><input aria-label={`${t("Select", "选择")} ${task.agentName} ${task.request.input.listing?.address || task.request.input.theme}`} type="checkbox" checked={checked.includes(task.id)} onChange={(e) => setChecked((v) => e.target.checked ? [...v, task.id] : v.filter((id) => id !== task.id))} /></label>
          {(task.request.input.listing?.imageAssetIds[0] || task.request.input.referenceAssetIds?.[0]) && <img src={`/api/content/assets/${task.request.input.listing?.imageAssetIds[0] || task.request.input.referenceAssetIds?.[0]}`} alt="" />}
          <div className="office-task-copy"><strong>{task.agentName} · {task.request.input.listing?.address || task.request.input.headline || topicLabel(task.request.input)}</strong><p className="studio-note">{topicLabel(task.request.input)} · {task.request.languages.map(languageLabel).join(" + ")} · {task.request.input.size} · {task.request.input.stylePrompt ? t("Custom prompt", "自定义提示词") : task.templateName?.[zh ? "zh" : "en"].split(" · ").at(-1)}</p>{task.request.input.kind === "listing" && <div className="office-row-controls"><Field label={t("Theme", "主题")}><select aria-label={`${task.request.input.listing?.address} ${t("theme", "主题")}`} disabled={busy || Boolean(task.submissionStartedAt)} value={task.request.input.theme} onChange={(e) => act(() => updateRow(task, { theme: e.target.value }))}>{LISTING_THEMES.map((v) => <option key={v.id} value={v.id}>{zh ? v.zh : v.en}</option>)}</select></Field><Field label={t("Language", "版本")}><select aria-label={`${task.request.input.listing?.address} ${t("language", "版本")}`} disabled={busy || Boolean(task.submissionStartedAt)} value={task.request.languages.length === 2 ? "both" : task.request.languages[0]} onChange={(e) => act(() => updateRow(task, { language: e.target.value }))}><option value="zh">中文</option><option value="en">English</option><option value="both">中文＋English</option></select></Field></div>}{officeDraftProblems(task.request.input, zh).map((p) => <p key={p} className="office-incomplete">{p}</p>)}{task.request.input.listing?.highlights?.length ? <details><summary>{t("Review selling points", "核对提取的卖点")}</summary>{task.request.input.listing.highlights.filter((h) => h.selected !== false).map((h, i) => <p key={i}>{zh ? h.zh : h.en}<small className="studio-note"> · {h.evidence}</small></p>)}</details> : null}{rowErrors[task.id] && <p role="alert" className="studio-error">{rowErrors[task.id]}</p>}</div>
          <div className="office-actions"><button className="studio-button secondary" disabled={busy} onClick={() => edit(task)}>{t("Edit", "编辑")}</button><button className="studio-button secondary" disabled={busy} onClick={() => edit(task, true)}>{t("Duplicate", "复制")}</button><button className="studio-button secondary" disabled={busy || Boolean(task.submissionStartedAt)} onClick={() => act(async () => { await contentFetch(`/api/content/office/${task.id}`, { method: "DELETE" }); setChecked((v) => v.filter((id) => id !== task.id)); })}>{t("Delete", "删除")}</button></div>
        </article>)}</div>
      </> : <>
        {view === "artwork" && <div className="office-toolbar">
          <label className="office-check"><input type="checkbox" checked={artwork.some((g) => g.status === "succeeded") && artwork.filter((g) => g.status === "succeeded").every((g) => selectedOutputs.includes(g.id))} onChange={(e) => setSelectedOutputs(e.target.checked ? artwork.filter((g) => g.status === "succeeded").map((g) => g.id) : [])} />{t("Select completed", "选中已完成")}</label>
          <div className="office-actions"><button disabled={busy || !pendingArtwork.length} className="studio-button secondary" onClick={() => act(() => batchOutputAction("approve"))}>{t(`Approve ${pendingArtwork.length}`, `审核通过 ${pendingArtwork.length} 张`)}</button><button disabled={busy || !deliverableArtwork.length} className="studio-button secondary" onClick={() => act(() => batchOutputAction("deliver"))}>{t(`Deliver ${deliverableArtwork.length}`, `交付 ${deliverableArtwork.length} 张`)}</button><button disabled={busy || !downloadableArtwork.length} className="studio-button" onClick={() => act(downloadZip)}>{t(`Download ${downloadableArtwork.length} approved`, `打包 ${downloadableArtwork.length} 张已审核作品`)}</button></div>
        </div>}
        {view === "artwork" && <p className="studio-note">{t("Select completed images, approve after review, then deliver or download. Unreviewed images are excluded from delivery and ZIP.", "选中成品并核对后，先审核通过，再交付或打包。未审核图片不会包含在交付或打包中。")}</p>}
        <div className="studio-works">{(view === "queue" ? running : artwork).map((g) => <article className="studio-work" key={g.id}>
          {g.outputAssetId ? <a href={`/api/content/assets/${g.outputAssetId}`} target="_blank" rel="noreferrer"><img src={`/api/content/assets/${g.outputAssetId}`} alt={`${g.brand.name} · ${g.input.listing?.address || g.input.theme}`} /></a> : <div className="studio-work-status">{statusLabel(g)}</div>}
          <div className="studio-work-body"><strong>{g.brand.name}</strong><h3>{g.input.listing?.address || g.input.headline || topicLabel(g.input)}</h3><p className="studio-note">{languageLabel(g.input.language)} · {statusLabel(g)}</p>
            {g.error && <p className="studio-error">{g.error === "CANCELLED_BY_USER" ? t("Cancelled before generation.", "已在生成前取消。") : generationErrorGuidance(g.error, g.status, zh)}</p>}
            <details><summary>{t("Check source copy", "核对原始文案")}</summary><p className="studio-note">{g.brand.name} · {g.brand.phone} · {g.brand.email}</p><p>{g.input.headline} {g.input.message}</p>{g.input.listing?.highlights?.filter((h) => h.selected !== false).map((h, i) => <p key={i}>{g.input.language === "zh" ? h.zh : h.en}</p>)}{g.input.events?.filter((e) => e.selected !== false).map((e, i) => <p key={i}>{e.date} {e.start}–{e.end}</p>)}<details><summary>{t("Full prompt", "完整生成提示词")}</summary><pre className="office-prompt">{g.prompt}</pre></details></details>
            <div className="office-actions">
              {g.status === "succeeded" && <><label className="office-check"><input type="checkbox" checked={selectedOutputs.includes(g.id)} onChange={(e) => setSelectedOutputs((v) => e.target.checked ? [...v, g.id] : v.filter((id) => id !== g.id))} />{t("Select", "选择")}</label><a className="studio-button secondary" href={`/api/content/assets/${g.outputAssetId}?download=1`}>{t("Download", "下载")}</a></>}
              {g.status === "queued" && <button className="studio-button secondary" disabled={busy} onClick={() => act(() => outputAction(g, "cancel"))}>{t("Cancel queued image", "取消排队")}</button>}
              {!running.includes(g) && <button className="studio-button secondary" onClick={() => { const task = tasks.find((v) => v.id === g.officeTaskId); if (task) edit(task, true, g); }}>{t("Re-generate", "重新生成")}</button>}
            </div>
          </div>
        </article>)}</div>
        {!(view === "queue" ? running : artwork).length && <p className="studio-empty">{t("No posters here yet.", "这里暂时没有海报。")}</p>}
      </>}
      <div className="office-toolbar"><button className="studio-button secondary" disabled={page === 0 || busy} onClick={() => { setChecked([]); setSelectedOutputs([]); setPage((p) => p - 1); }}>{t("Previous", "上一页")}</button><span>{page + 1}</span><button className="studio-button secondary" disabled={!hasMore || busy} onClick={() => { setChecked([]); setSelectedOutputs([]); setPage((p) => p + 1); }}>{t("Next", "下一页")}</button></div>
    </>}
  </div>;
}
