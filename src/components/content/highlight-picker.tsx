"use client";
import { Check, ChevronDown, Pencil } from "lucide-react";
import type { ListingContext, PosterHighlight } from "@/lib/content/types";
import { Field } from "./ui";

type Group = "highlights" | "financialFacts";
export function HighlightPicker({
  listing,
  zh,
  busy,
  onChange,
}: {
  listing: ListingContext;
  zh: boolean;
  busy: boolean;
  onChange: (value: Partial<ListingContext>) => void;
}) {
  const t = (en: string, cn: string) => (zh ? cn : en);
  const selectedCount = [...(listing.highlights || []), ...(listing.financialFacts || [])]
    .filter((item) => item.selected !== false).length;
  function update(
    group: Group,
    index: number,
    value: Partial<PosterHighlight>,
  ) {
    const items = listing[group] || [];
    // Each group retains its original fields, including the financial fact kind.
    onChange({
      [group]: items.map((item, i) =>
        i === index ? { ...item, ...value } : item,
      ),
    });
  }
  return (
    <div className="studio-highlight-picker">
      <section className="studio-highlight-group" aria-label={t("Property highlights", "房屋亮点")}>
        <div className="studio-highlight-heading">
          <h4>{t("Property highlights", "房屋亮点")}</h4>
          <span>{t(`${selectedCount} selected`, `已选 ${selectedCount} 条`)}</span>
        </div>
        {(["highlights", "financialFacts"] as const).flatMap((group) =>
          (listing[group] || []).map((item, index) => {

            const selected = item.selected !== false;
            const title = item[zh ? "zh" : "en"] || item[zh ? "en" : "zh"];
            const incomplete =
              selected && (!item.en.trim() || !item.zh.trim());
            return (
              <article
                className={`studio-highlight-card ${selected ? "selected" : ""}`}
                key={`${group}-${index}`}
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
          }),
        )}
      </section>
    </div>
  );
}
