"use client";
import { useId, useState } from "react";
import { ListingPicker } from "./listing-picker";
import { contentFetch, Field } from "./ui";
import { EventEditor } from "./event-editor";
import { newOpenHouseEvent } from "@/lib/content/events";
import { officeLanguages, officeListingInput, officeTemplate, needsOfficeHighlights, type OfficeDefaults } from "@/lib/content/office-production";
import type { StudioListing } from "@/lib/content/listing-source";
import { LISTING_THEMES, type ContentInput, type ContentTemplate, type PosterHighlight } from "@/lib/content/types";

export function OfficeListingImport({ subjectAgentId, agentName, zh, defaults, onDefaults, onSaved, onError, onBusy }: {
  subjectAgentId: number; agentName: string; zh: boolean; defaults: OfficeDefaults; onDefaults: (v: OfficeDefaults) => void;
  onSaved: (ids: string[], complete: boolean) => Promise<void>; onError: (message: string) => void; onBusy: (busy: boolean) => void;
}) {
  const t = (en: string, cn: string) => zh ? cn : en;
  const [selected, setSelected] = useState<StudioListing[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const scheduleId = useId();
  const [overrideEvents, setOverrideEvents] = useState(false);
  const [events, setEvents] = useState([newOpenHouseEvent()]);
  const patch = (v: Partial<OfficeDefaults>) => onDefaults({ ...defaults, ...v });
  async function importSelected() {
    setBusy(true); onBusy(true); onError("");
    const saved: string[] = [], failed: string[] = [], warnings: string[] = [];
    const succeeded = new Set<string>();
    try {
      const { templates } = await contentFetch<{ templates: ContentTemplate[] }>("/api/content/templates");
      const template = officeTemplate(templates, defaults.theme, defaults.style);
      for (const [index, listing] of selected.entries()) {
        setProgress(`${index + 1} / ${selected.length} · ${listing.address.full}`);
        try {
          const { listing: detail } = await contentFetch<{ listing: StudioListing }>(`/api/content/listings?slug=${encodeURIComponent(listing.slug)}`);
          if (!detail.photos[0]) throw new Error(t("No listing photo; add this poster individually and upload a photo.", "缺少房源照片，请单独添加并上传图片。"));
          const { asset } = await contentFetch<{ asset: { id: string } }>(`/api/content/assets?subject=${subjectAgentId}`, { method: "POST", body: JSON.stringify({ url: detail.photos[0].url }) });
          const input = officeListingInput(detail, asset.id, defaults, overrideEvents ? events : undefined);
          let highlightsFailed = false;
          if (needsOfficeHighlights(defaults.theme) && (detail.description?.trim().length || 0) >= 10) {
            try {
              const result = await contentFetch<{ highlights: PosterHighlight[]; financialFacts: NonNullable<ContentInput["listing"]>["financialFacts"]; model: string }>("/api/content/highlights", { method: "POST", body: JSON.stringify({ listing: input.listing }) });
              Object.assign(input.listing!, { highlights: result.highlights, financialFacts: result.financialFacts, highlightsModel: result.model, highlightsReviewed: false });
            } catch {
              highlightsFailed = true;
            }
          }
          const { id } = await contentFetch<{ id: string }>("/api/content/office", { method: "POST", body: JSON.stringify({ subjectAgentId, request: { templateId: template.id, input, languages: officeLanguages(defaults.language) } }) });
          saved.push(id); succeeded.add(listing.id);
          if (highlightsFailed) warnings.push(`${listing.address.full}: ${t("Draft preserved without AI highlights. Edit to retry or use basic details.", "卖点提取失败，已保留基础资料草稿。点击编辑可重试或仅用基础资料生成。")}`);
        } catch (e) { failed.push(`${listing.address.full}: ${e instanceof Error ? e.message : "Import failed"}`); }
      }
      setSelected((v) => v.filter((l) => !succeeded.has(l.id)));
      await onSaved(saved, failed.length === 0);
      if (failed.length || warnings.length) onError([...failed, ...warnings].join("\n"));
      setProgress(t(`${saved.length} drafts saved. Review before generating.`, `已保存 ${saved.length} 条草稿，请核对后生成。`));
    } catch (e) { onError(e instanceof Error ? e.message : "Import failed"); }
    finally { setBusy(false); onBusy(false); }
  }
  const themeName = LISTING_THEMES.find((v) => v.id === defaults.theme)?.[zh ? "zh" : "en"];
  return <section className="office-import" aria-label={t("Choose topic and properties", "选择主题与房源")}>
    <fieldset disabled={busy} className="office-topic-settings">
      <legend>{t("1 · Poster theme", "1 · 选择海报主题")}</legend>
      <div className="office-theme-grid" role="group" aria-label={t("Poster theme", "海报主题")}>{LISTING_THEMES.map((v) => <button key={v.id} type="button" aria-pressed={defaults.theme === v.id} onClick={() => patch({ theme: v.id })}><strong>{v.en}</strong><span>{v.zh}</span></button>)}</div>
      <p className="studio-note">{t("This theme applies to the selected posters. Listing status is shown separately below.", "所选主题用于本批海报；下方交易状态来自房源资料，两者独立。")}</p>
      <div className="office-defaults"><Field label={t("Language", "生成版本")}><select value={defaults.language} onChange={(e) => patch({ language: e.target.value as OfficeDefaults["language"] })}><option value="zh">中文</option><option value="en">English</option><option value="both">中文＋英文 · 分别生成两张</option></select></Field>
        <details><summary>{t("Style & size", "风格与画幅")} · {defaults.style === "editorial" ? t("Classic", "经典") : t("Minimal", "极简")} · {defaults.size}</summary><div className="office-batch-controls"><Field label={t("Style", "风格")}><select value={defaults.style} onChange={(e) => patch({ style: e.target.value as OfficeDefaults["style"] })}><option value="editorial">Homix {t("Classic", "经典")}</option><option value="modern">Homix {t("Minimal", "极简")}</option></select></Field><Field label={t("Size", "画幅")}><select value={defaults.size} onChange={(e) => patch({ size: e.target.value as OfficeDefaults["size"] })}><option value="1024x1280">{t("Portrait", "竖版")} · 4:5</option><option value="1024x1024">{t("Square", "方形")} · 1:1</option><option value="1152x2048">Story · 9:16</option></select></Field></div></details>
      </div>
      {defaults.theme === "open_house" && <div className="office-batch-events">
        <fieldset className="office-schedule" aria-describedby={`${scheduleId}-help`}>
          <legend>{t("Open House times", "公展时间")}</legend>
          <label className="office-schedule-option">
            <input type="radio" name={scheduleId} checked={!overrideEvents} onChange={() => setOverrideEvents(false)} />
            <span>{t("Use each property's MLS times", "使用各房源的 MLS 时间")}<small>{t("Default", "默认")}</small></span>
          </label>
          <label className="office-schedule-option">
            <input type="radio" name={scheduleId} checked={overrideEvents} onChange={() => setOverrideEvents(true)} />
            <span>{t("Set the same times for all selected properties", "为所有选中房源设置相同时间")}</span>
          </label>
          <p id={`${scheduleId}-help`} className="office-schedule-help">
            {overrideEvents
              ? t("The dates and times you enter below will apply to every property you select in this batch.", "下方填写的日期和时间，将用于本次选中的每一套房源。")
              : t("Each property keeps its own MLS dates and times, including multiple sessions. If a schedule is missing, the next step will ask you to fill it in.", "每套房源自动带入自己的公展日期和时间，周六、周日多场也会一起带入。没有时间的房源，下一步会提示补填。")}
          </p>
        </fieldset>
        {overrideEvents && <EventEditor helpText={t("Add one or more sessions below, using local time at the property. New sessions default to 1–3 PM.", "在下方添加一场或多场公展，按房源当地时间填写。新增场次默认下午 1–3 点。")} zh={zh} disabled={busy} events={events} onChange={setEvents} />}
      </div>}
    </fieldset>
    <h3>{t("2 · Select properties", "2 · 勾选房源")}</h3>
    <ListingPicker zh={zh} disabled={busy} onError={onError} onChoose={async () => {}} selection={{ ids: selected.map((v) => v.id), onToggle: (listing) => setSelected((v) => v.some((l) => l.id === listing.id) ? v.filter((l) => l.id !== listing.id) : [...v, listing]), onSelectPage: (listings, checked) => setSelected((v) => checked ? [...v, ...listings.filter((l) => !v.some((old) => old.id === l.id))] : v.filter((l) => !listings.some((item) => item.id === l.id))) }} />
    <div className="office-selection-bar">
      <div><strong>{agentName} · {themeName} · {defaults.language === "both" ? "中文＋English" : defaults.language === "zh" ? "中文" : "English"}</strong><p role="status">{busy ? progress : t(`${selected.length} properties · ${selected.length * officeLanguages(defaults.language).length} posters`, `已选 ${selected.length} 套 · 共 ${selected.length * officeLanguages(defaults.language).length} 张海报`)}</p></div>
      <button className="studio-button" disabled={busy || !selected.length} onClick={importSelected}>{busy ? t("Preparing drafts…", "正在准备草稿…") : t(`Next: review ${selected.length * officeLanguages(defaults.language).length} posters`, `下一步：核对 ${selected.length * officeLanguages(defaults.language).length} 张`)}</button>
      {selected.length > 0 && <details className="office-selected-summary"><summary>{t("View selected properties", "查看已选房源")} ({selected.length})</summary><button className="studio-button secondary" disabled={busy} onClick={() => setSelected([])}>{t("Clear selection", "清空选择")}</button><ul>{selected.map((l) => <li key={l.id}><span>{l.address.full}</span><button type="button" disabled={busy} aria-label={t(`Remove ${l.address.full}`, `移除 ${l.address.full}`)} onClick={() => setSelected((v) => v.filter((x) => x.id !== l.id))}>×</button></li>)}</ul></details>}
    </div>
  </section>;
}
