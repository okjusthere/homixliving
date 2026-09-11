import type { ContentInput, OpenHouseEvent } from "./types";

export function newOpenHouseEvent(previous?: OpenHouseEvent): OpenHouseEvent {
  let date = "";
  if (previous?.date && /^\d{4}-\d{2}-\d{2}$/.test(previous.date)) {
    const next = new Date(`${previous.date}T12:00:00Z`);
    if (
      Number.isFinite(next.valueOf()) &&
      next.toISOString().slice(0, 10) === previous.date
    ) {
      next.setUTCDate(next.getUTCDate() + 1);
      date = next.toISOString().slice(0, 10);
    }
  }
  return {
    date,
    start: previous?.start || "13:00",
    end: previous?.end || "15:00",
    timezone: previous?.timezone || "America/New_York",
    selected: true,
  };
}

export function contentEvents(
  input: Pick<ContentInput, "events" | "event">,
): OpenHouseEvent[] {
  // An explicitly empty list must not resurrect a removed legacy event.
  return input.events ?? (input.event ? [input.event] : []);
}

export function eventWeekday(date: string, language: string) {
  const value = new Date(`${date}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(value.valueOf()) ||
    value.toISOString().slice(0, 10) !== date
  )
    return "";
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    weekday: "long",
    timeZone: "UTC",
  }).format(value);
}

export function posterEvents(input: ContentInput) {
  if (input.kind !== "listing" || input.theme !== "open_house")
    return undefined;
  return contentEvents(input)
    .filter((event) => event.selected !== false)
    .map(({ date, start, end, timezone }) => ({
      date,
      weekday: eventWeekday(date, input.language),
      start,
      end,
      timezone,
    }))
    .sort((a, b) =>
      `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`),
    );
}
