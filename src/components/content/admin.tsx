"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/homix/page-kit";
import { useLocale } from "@/lib/i18n-client";
import { contentFetch, Field, TemplateArt } from "./ui";
import { GenerationReview } from "./generation-review";
import {
  IMAGE_SIZES,
  LISTING_THEMES,
  type ContentTemplate,
  type TemplateConfig,
  type Holiday,
} from "@/lib/content/types";

const freshConfig: TemplateConfig = {
  name: { en: "", zh: "" },
  description: { en: "", zh: "" },
  kind: "listing",
  themes: ["just_listed"],
  style: "editorial",
  prompt: "",
  colors: ["#F6F2EA", "#222A26", "#BA6243"],
  referenceAssetIds: [],
  sizes: [...IMAGE_SIZES],
};
const freshHoliday: Holiday = {
  id: "",
  country: "US",
  name: { en: "", zh: "" },
  greeting: { en: "", zh: "" },
  enabled: true,
  dates: [],
};
export function ContentAdmin() {
  const locale = useLocale(),
    t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const [tab, setTab] = useState("templates"),
    [templates, setTemplates] = useState<ContentTemplate[]>([]),
    [holidays, setHolidays] = useState<Holiday[]>([]),
    [selected, setSelected] = useState<ContentTemplate | null>(null);
  const [config, setConfig] = useState<TemplateConfig>(freshConfig),
    [holiday, setHoliday] = useState<Holiday>(freshHoliday),
    [dates, setDates] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dailyLimit, setDailyLimit] = useState(10),
    [search, setSearch] = useState("");
  async function reload() {
    const [a, b] = await Promise.all([
      contentFetch<{ templates: ContentTemplate[] }>(
        "/api/content/templates?admin=1",
      ),
      contentFetch<{ holidays: Holiday[] }>("/api/content/holidays?admin=1"),
    ]);
    setTemplates(a.templates);
    setHolidays(b.holidays);
  }
  useEffect(() => {
    reload().catch((e) => setError(e.message));
    contentFetch<{ dailyLimit: number }>("/api/content/settings")
      .then((s) => setDailyLimit(s.dailyLimit))
      .catch((e) => setError(e.message));
  }, []);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  const patch = (value: Partial<TemplateConfig>) =>
    setConfig((v) => ({ ...v, ...value }));
  const choose = (v: ContentTemplate) => {
    setSelected(v);
    setConfig(structuredClone(v.config));
    setNotice("");
  };
  const preview: ContentTemplate = {
    id: "preview",
    familyId: "",
    version: 1,
    status: "draft",
    createdAt: "",
    config,
  };
  return (
    <div className="studio">
      <PageHeader
        eyebrow="HOMIX / CREATIVE DIRECTION"
        title={t("Your template library", "管理创作模板")}
        description={t(
          "Write the style once. Give every Agent their own version.",
          "把风格写进模板，让每位经纪人拥有自己的作品。",
        )}
        actions={
          <Link className="studio-button secondary" href="/content">
            {t("Back to studio", "返回内容中心")}
          </Link>
        }
      />
      <div
        className="studio-tabs"
        role="tablist"
        aria-label={t("Administration", "管理")}
      >
        {["templates", "holidays", "settings", "generations"].map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={tab === v}
            onClick={() => setTab(v)}
          >
            {v === "templates"
              ? t("Style prompts", "风格提示词")
              : v === "holidays"
                ? t("Holiday calendar", "节日目录")
                : v === "generations"
                  ? t("Generation review", "生成检查")
                  : t("Usage settings", "使用设置")}
          </button>
        ))}
      </div>
      {error && (
        <div className="studio-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <p role="status" className="studio-note">
          {notice}
        </p>
      )}
      {tab === "generations" ? (
        <GenerationReview />
      ) : tab === "templates" ? (
        <div className="studio-grid">
          <main>
            <div className="studio-row mb-4">
              <input
                className="studio-search"
                aria-label={t("Search templates", "搜索模板")}
                placeholder={t("Find a style…", "查找风格…")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                className="studio-button secondary"
                onClick={() => {
                  setSelected(null);
                  setConfig(structuredClone(freshConfig));
                }}
              >
                {t("New template", "新建模板")}
              </button>
            </div>
            <div className="studio-styles">
              {templates
                .filter((v) =>
                  `${v.config.name.en} ${v.config.name.zh}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((v) => (
                  <button
                    key={v.id}
                    className={`studio-style ${selected?.id === v.id ? "selected" : ""}`}
                    onClick={() => choose(v)}
                  >
                    <TemplateArt template={v} />
                    <div className="studio-style-caption">
                      <span>{v.config.name[locale]}</span>
                      <small>
                        v{v.version} · {v.status}
                      </small>
                    </div>
                  </button>
                ))}
            </div>
          </main>
          <aside className="studio-panel">
            <h2 className="mb-4">
              {selected
                ? t("New version of this style", "编辑为新版本")
                : t("New style", "新建风格")}
            </h2>
            <Field label="English name">
              <input
                value={config.name.en}
                onChange={(e) =>
                  patch({ name: { ...config.name, en: e.target.value } })
                }
              />
            </Field>
            <Field label="中文名称">
              <input
                value={config.name.zh}
                onChange={(e) =>
                  patch({ name: { ...config.name, zh: e.target.value } })
                }
              />
            </Field>
            <Field label={t("Category", "分类")}>
              <select
                value={config.kind}
                onChange={(e) =>
                  patch({
                    kind: e.target.value as TemplateConfig["kind"],
                    themes:
                      e.target.value === "holiday" ? ["*"] : ["just_listed"],
                  })
                }
              >
                <option value="listing">
                  {t("Listing poster", "房源海报")}
                </option>
                <option value="holiday">
                  {t("Holiday greeting", "节日海报")}
                </option>
              </select>
            </Field>
            <Field label={t("Topic", "主题")}>
              <select
                value={config.themes[0] || "*"}
                onChange={(e) => patch({ themes: [e.target.value] })}
              >
                {config.kind === "listing" ? (
                  LISTING_THEMES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v[locale]}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="*">{t("All holidays", "所有节日")}</option>
                    {holidays.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name[locale]}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </Field>
            <Field
              label={t("Style prompt", "风格提示词")}
              hint="{{theme}} · {{agent.name}} · {{agent.email}} · {{agent.phone}} · {{brokerage.name}} · {{listing.address}} · {{listing.price}} · {{holiday.name}} · {{message}}"
            >
              <textarea
                style={{ minHeight: 280 }}
                value={config.prompt}
                onChange={(e) => patch({ prompt: e.target.value })}
              />
            </Field>
            <div className="studio-row">
              {config.colors.map((color, i) => (
                <Field
                  key={i}
                  label={
                    [t("Paper", "底色"), t("Ink", "文字"), t("Accent", "点缀")][
                      i
                    ]
                  }
                >
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => {
                      const colors = [
                        ...config.colors,
                      ] as TemplateConfig["colors"];
                      colors[i] = e.target.value;
                      patch({ colors });
                    }}
                  />
                </Field>
              ))}
            </div>
            <Field label={t("Reference images / logo", "风格参考图 / Logo")}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy || config.referenceAssetIds.length >= 3}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    act(async () => {
                      const body = new FormData();
                      body.set("file", file);
                      body.set("purpose", "template");
                      const { asset } = await contentFetch<{
                        asset: { id: string };
                      }>("/api/content/assets", { method: "POST", body });
                      patch({
                        referenceAssetIds: [
                          ...config.referenceAssetIds,
                          asset.id,
                        ],
                      });
                    });
                  e.target.value = "";
                }}
              />
            </Field>
            {config.referenceAssetIds.map((id, i) => (
              <div key={id} className="studio-note">
                <a
                  className="underline"
                  href={`/api/content/assets/${id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("Reference", "参考图")} {i + 1}
                </a>{" "}
                <button
                  onClick={() =>
                    patch({
                      referenceAssetIds: config.referenceAssetIds.filter(
                        (v) => v !== id,
                      ),
                    })
                  }
                >
                  {t("Remove", "移除")}
                </button>
              </div>
            ))}
            <div className="studio-row">
              <button
                className="studio-button"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const { template } = await contentFetch<{
                      template: ContentTemplate;
                    }>("/api/content/templates", {
                      method: "POST",
                      body: JSON.stringify({
                        familyId: selected?.familyId,
                        config,
                      }),
                    });
                    choose(template);
                    setNotice(
                      t(
                        "Draft saved. Test it before publishing.",
                        "草稿已保存，可先试生成，再发布。",
                      ),
                    );
                  })
                }
              >
                {t("Save draft", "保存草稿")}
              </button>
              {selected && (
                <Link
                  className="studio-button secondary"
                  href={`/content?template=${selected.id}`}
                >
                  {t("Test saved version", "试生成已保存版本")}
                </Link>
              )}
            </div>
            {selected && (
              <div className="studio-row mt-4">
                <button
                  className="studio-button secondary"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await contentFetch("/api/content/templates", {
                        method: "PATCH",
                        body: JSON.stringify({
                          id: selected.id,
                          action: "publish",
                        }),
                      });
                      setNotice(
                        t("This version is now published.", "该版本已发布。"),
                      );
                    })
                  }
                >
                  {t("Publish saved version", "发布已保存版本")}
                </button>
                <button
                  className="studio-button secondary"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await contentFetch("/api/content/templates", {
                        method: "PATCH",
                        body: JSON.stringify({
                          id: selected.id,
                          action: "retire",
                        }),
                      });
                      setNotice(t("Version retired.", "该版本已停用。"));
                    })
                  }
                >
                  {t("Retire", "停用")}
                </button>
              </div>
            )}
            <p className="studio-note">
              {t(
                "Saving creates a new draft. Publishing replaces the active version; past artwork keeps its original prompt.",
                "保存会创建新草稿，发布后替代当前版本；历史作品保留原提示词。",
              )}
            </p>
            <TemplateArt template={preview} />
          </aside>
        </div>
      ) : tab === "holidays" ? (
        <div className="studio-grid">
          <main>
            <button
              className="studio-button secondary mb-4"
              onClick={() => {
                setHoliday(structuredClone(freshHoliday));
                setDates("");
              }}
            >
              {t("Add holiday", "添加节日")}
            </button>
            <div className="studio-holidays" style={{ maxHeight: "none" }}>
              {holidays.map((h) => (
                <button
                  key={h.id}
                  className={`studio-holiday ${holiday.id === h.id ? "selected" : ""}`}
                  onClick={() => {
                    setHoliday(structuredClone(h));
                    setDates(h.dates.map((d) => d.date).join("\n"));
                  }}
                >
                  {h.name[locale]}
                  <small>
                    {h.country} ·{" "}
                    {h.enabled
                      ? t("Enabled", "已启用")
                      : t("Disabled", "已停用")}
                  </small>
                </button>
              ))}
            </div>
          </main>
          <aside className="studio-panel">
            <Field
              label={t("Stable holiday ID", "节日标识")}
              hint="lowercase-letters-and-hyphens"
            >
              <input
                value={holiday.id}
                onChange={(e) =>
                  setHoliday((h) => ({ ...h, id: e.target.value }))
                }
              />
            </Field>
            <Field label={t("Country", "国家")}>
              <select
                value={holiday.country}
                onChange={(e) =>
                  setHoliday((h) => ({
                    ...h,
                    country: e.target.value as Holiday["country"],
                  }))
                }
              >
                <option value="US">US</option>
                <option value="CN">CN</option>
              </select>
            </Field>
            {(["en", "zh"] as const).map((lang) => (
              <div key={lang}>
                <Field label={lang === "en" ? "English name" : "中文名称"}>
                  <input
                    value={holiday.name[lang]}
                    onChange={(e) =>
                      setHoliday((h) => ({
                        ...h,
                        name: { ...h.name, [lang]: e.target.value },
                      }))
                    }
                  />
                </Field>
                <Field
                  label={lang === "en" ? "English greeting" : "中文祝福语"}
                >
                  <textarea
                    value={holiday.greeting[lang]}
                    onChange={(e) =>
                      setHoliday((h) => ({
                        ...h,
                        greeting: { ...h.greeting, [lang]: e.target.value },
                      }))
                    }
                  />
                </Field>
              </div>
            ))}
            <Field
              label={t("Annual dates", "年度日期")}
              hint={t(
                "One actual calendar date per year, YYYY-MM-DD on each line. Use the festival date, not an observed day off.",
                "每年一行，格式 YYYY-MM-DD；填写节日本身日期，不填调休日期。",
              )}
            >
              <textarea
                value={dates}
                placeholder="2026-12-25\n2027-12-25"
                onChange={(e) => setDates(e.target.value)}
              />
            </Field>
            <label className="studio-check">
              <input
                type="checkbox"
                checked={holiday.enabled}
                onChange={(e) =>
                  setHoliday((h) => ({ ...h, enabled: e.target.checked }))
                }
              />
              {t("Visible to Agents", "对经纪人可见")}
            </label>
            <button
              className="studio-button"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await contentFetch("/api/content/holidays", {
                    method: "PUT",
                    body: JSON.stringify({
                      ...holiday,
                      dates: dates
                        .split(/\s+/)
                        .filter(Boolean)
                        .map((date) => ({
                          year: Number(date.slice(0, 4)),
                          date,
                        })),
                    }),
                  });
                  setNotice(t("Holiday saved.", "节日已保存。"));
                })
              }
            >
              {t("Save holiday", "保存节日")}
            </button>
          </aside>
        </div>
      ) : (
        <div className="studio-panel" style={{ maxWidth: 460 }}>
          <Field
            label={t(
              "Daily generation limit per Agent",
              "每位经纪人每日生成上限",
            )}
          >
            <input
              type="number"
              min={1}
              max={100}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(Number(e.target.value))}
            />
          </Field>
          <button
            className="studio-button"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await contentFetch("/api/content/settings", {
                  method: "PATCH",
                  body: JSON.stringify({ dailyLimit }),
                });
                setNotice(t("Limit updated.", "上限已更新。"));
              })
            }
          >
            {t("Save limit", "保存上限")}
          </button>
          <p className="studio-note">
            {t(
              "All Agent generations and template tests use the configured Azure gpt-image-2 deployment.",
              "经纪人生成和模板试生成统一使用配置的 Azure gpt-image-2 部署。",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
