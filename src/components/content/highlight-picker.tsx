"use client";
import { useState } from "react";
import { Check, ChevronDown, Pencil } from "lucide-react";
import type { ListingContext, PosterHighlight } from "@/lib/content/types";
import { Field } from "./ui";

type Group = "highlights" | "financialFacts";
export function HighlightPicker({
  listing,
  maxHighlights,
  zh,
  busy,
  onChange,
}: {
  listing: ListingContext;
  maxHighlights: number;
  zh: boolean;
  busy: boolean;
  onChange: (value: Partial<ListingContext>) => void;
}) {
  const [notice, setNotice] = useState<{
    group: Group;
    index: number;
    message: string;
  } | null>(null);
  const t = (en: string, cn: string) => (zh ? cn : en);
  function update(
    group: Group,
    index: number,
    value: Partial<PosterHighlight>,
  ) {
    const items = listing[group] || [];
    const limit = group === "highlights" ? maxHighlights : 4;
    if (
      value.selected === true &&
      items.filter((h) => h.selected !== false).length >= limit
    ) {
      setNotice({
        group,
        index,
        message: t(
          `You have selected ${limit}. Deselect one selected card before adding another.`,
          `已选满 ${limit} 条，请先点击一张已选卡片取消，再选择新的内容。`,
        ),
      });
      return;
    }
    setNotice(null);
    // Each group retains its original fields, including the financial fact kind.
    onChange({
      [group]: items.map((item, i) =>
        i === index ? { ...item, ...value } : item,
      ),
    });
  }
  return (
    <div className="studio-highlight-picker">
      {(["highlights", "financialFacts"] as const).map((group) => {
        const items = listing[group] || [];
        if (!items.length) return null;
        const count = items.filter((h) => h.selected !== false).length;
        const limit = group === "highlights" ? maxHighlights : 4;
        return (
          <section
            className="studio-highlight-group"
            key={group}
            aria-label={
              group === "highlights"
                ? t("Selling points", "卖点")
                : t("Stated costs", "费用事实")
            }
          >
            <div className="studio-highlight-heading">
              <h4>
                {group === "highlights"
                  ? t("Selling points", "卖点")
                  : t("Stated costs", "费用事实")}
              </h4>
              <span className={count > limit ? "over-limit" : ""}>
                {t(`${count} / ${limit} selected`, `已选 ${count} / ${limit}`)}
              </span>
            </div>
            {count > limit && (
              <p className="studio-highlight-notice" role="status">
                {t(
                  `Deselect ${count - limit} item(s) to continue.`,
                  `请取消 ${count - limit} 条选择后继续。`,
                )}
              </p>
            )}
            {items.map((item, index) => {
              const selected = item.selected !== false;
              const title = item[zh ? "zh" : "en"] || item[zh ? "en" : "zh"];
              const incomplete =
                selected && (!item.en.trim() || !item.zh.trim());
              return (
                <article
                  className={`studio-highlight-card ${selected ? "selected" : ""}`}
                  key={index}
                >
                  <button
                    type="button"
                    className="studio-highlight-select"
                    aria-pressed={selected}
                    disabled={busy}
                    aria-label={t(
                      `${selected ? "Deselect" : "Select"} ${title || `item ${index + 1}`}`,
                      `${selected ? "取消选择" : "选择"}${title || `第 ${index + 1} 条`}`,
                    )}
                    onClick={() =>
                      update(group, index, { selected: !selected })
                    }
                  >
                    <span className="studio-highlight-check" aria-hidden="true">
                      {selected && <Check size={18} />}
                    </span>
                    <span>
                      {title || t("Add copy for this item", "请填写此条文案")}
                    </span>
                    <span className="studio-highlight-state">
                      {selected ? t("Selected", "已选") : t("Select", "选入")}
                    </span>
                  </button>
                  {notice?.group === group && notice.index === index && (
                    <p
                      className="studio-highlight-notice"
                      role="status"
                      aria-live="polite"
                    >
                      {notice.message}
                    </p>
                  )}
                  <details className="studio-highlight-details">
                    <summary>
                      <Pencil size={13} aria-hidden="true" />
                      {t("Edit & view source", "编辑文案 / 查看原文")}
                      <ChevronDown size={14} aria-hidden="true" />
                    </summary>
                    <div className="studio-highlight-editor">
                      {([zh ? "zh" : "en", zh ? "en" : "zh"] as const).map(
                        (language) => (
                          <Field
                            key={language}
                            label={
                              language === "zh"
                                ? t("Chinese", "中文文案")
                                : t("English", "英文文案")
                            }
                          >
                            <textarea
                              rows={2}
                              maxLength={language === "zh" ? 160 : 240}
                              disabled={busy}
                              value={item[language]}
                              aria-invalid={selected && !item[language].trim()}
                              onChange={(e) =>
                                update(group, index, {
                                  [language]: e.target.value,
                                })
                              }
                            />
                            <small>
                              {item[language].length} /{" "}
                              {language === "zh" ? 160 : 240}
                            </small>
                          </Field>
                        ),
                      )}
                      <div className="studio-highlight-evidence">
                        <strong>{t("Original source", "原文依据")}</strong>
                        <p>{item.evidence}</p>
                      </div>
                    </div>
                  </details>
                  {incomplete && (
                    <p className="studio-highlight-notice">
                      {t(
                        "Open Edit and complete both languages, or deselect this card.",
                        "请在「编辑文案」中补全中英文内容，或取消选择此卡片。",
                      )}
                    </p>
                  )}
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
