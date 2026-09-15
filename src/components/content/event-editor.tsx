"use client";

import { Plus, Trash2 } from "lucide-react";
import { eventWeekday, newOpenHouseEvent } from "@/lib/content/events";
import type { OpenHouseEvent } from "@/lib/content/types";
import { Field } from "./ui";

export function EventEditor({
  events,
  onChange,
  zh,
  disabled = false,
  helpText,
}: {
  events: OpenHouseEvent[];
  onChange: (events: OpenHouseEvent[]) => void;
  zh: boolean;
  disabled?: boolean;
  helpText?: string;
}) {
  const t = (en: string, cn: string) => (zh ? cn : en);
  const update = (index: number, value: Partial<OpenHouseEvent>) =>
    onChange(
      events.map((event, i) => (i === index ? { ...event, ...value } : event)),
    );
  const selected = events.filter((event) => event.selected !== false).length;
  return (
    <section
      className="studio-events"
      aria-label={t("Open House sessions", "公展场次")}
    >
      <div className="studio-events-heading">
        <h3>{t("Open House sessions", "公展场次")}</h3>
        <span aria-live="polite">
          {t(`${selected} selected`, `已选 ${selected} 场`)}
        </span>
      </div>
      <p className="studio-note">
        {helpText || t(
          "All selected sessions appear on one poster, using local time at the property. MLS schedules take priority; new sessions default to 1–3 PM.",
          "所选场次会放在同一张海报上，时间以房源所在地为准。优先使用 MLS 时间；新场次默认为下午 1–3 点。",
        )}
      </p>
      {events.map((event, index) => {
        const name = t(`Session ${index + 1}`, `第 ${index + 1} 场公展`);
        const weekday = eventWeekday(event.date, zh ? "zh" : "en");
        const chosen = event.selected !== false;
        return (
          <fieldset
            className={`studio-event-card ${chosen ? "selected" : ""}`}
            key={index}
            disabled={disabled}
          >
            <legend>
              {name}
              {weekday && ` · ${weekday}`}
            </legend>
            <div className="studio-event-actions">
              <label className="studio-check">
                <input
                  type="checkbox"
                  aria-label={t(
                    `Include session ${index + 1} on poster`,
                    `第 ${index + 1} 场放上海报`,
                  )}
                  checked={chosen}
                  onChange={(e) =>
                    update(index, { selected: e.target.checked })
                  }
                />
                {t("Include on poster", "放上海报")}
              </label>
              <button
                type="button"
                className="studio-button secondary"
                aria-label={t(
                  `Delete session ${index + 1}`,
                  `删除第 ${index + 1} 场公展`,
                )}
                onClick={() => onChange(events.filter((_, i) => i !== index))}
              >
                <Trash2 size={15} />
                {t("Delete", "删除")}
              </button>
            </div>
            <Field label={t("Date", "日期")}>
              <input
                type="date"
                aria-label={`${name} ${t("date", "日期")}`}
                value={event.date}
                onChange={(e) => update(index, { date: e.target.value })}
              />
            </Field>
            <div className="studio-event-times">
              <Field label={t("Starts", "开始")}>
                <input
                  type="time"
                  aria-label={`${name} ${t("start time", "开始时间")}`}
                  value={event.start}
                  onChange={(e) => update(index, { start: e.target.value })}
                />
              </Field>
              <Field label={t("Ends", "结束")}>
                <input
                  type="time"
                  aria-label={`${name} ${t("end time", "结束时间")}`}
                  value={event.end}
                  onChange={(e) => update(index, { end: e.target.value })}
                />
              </Field>
            </div>
            {chosen && event.start && event.end && event.end <= event.start && (
              <p className="studio-event-error" role="alert">
                {t(
                  `${name}: end time must be after start time.`,
                  `${name}：结束时间必须晚于开始时间，请修改。`,
                )}
              </p>
            )}
          </fieldset>
        );
      })}
      {!selected && (
        <p className="studio-event-error" role="status">
          {t(
            "Add or select at least one session before generating.",
            "请添加或选中至少一场公展，再生成海报。",
          )}
        </p>
      )}
      <button
        type="button"
        className="studio-button secondary"
        disabled={disabled}
        onClick={() => onChange([...events, newOpenHouseEvent(events.at(-1))])}
      >
        <Plus size={16} />
        {t("Add another day", "添加一天")}
      </button>
      {events.length > 0 && (
        <p className="studio-note">
          {t(
            "Adds the following day with the same hours. Check each date and time before generating.",
            "新增场次自动顺延一天并沿用时间。生成前请确认每场日期和时间。",
          )}
        </p>
      )}
    </section>
  );
}
