// Temporal values arrive from Postgres as strings (drizzle's node-postgres
// session forces raw-text parsing for date/timestamp OIDs), but the exact
// shape depends on the column type:
//
//   timestamptz  "2026-07-28 01:14:31.123+00"   (space separator, offset)
//   date         "2026-07-28"
//   legacy text  "2026-07-28T01:14:31.123Z"     (rows written before the
//                                                type migration, and values
//                                                the app itself creates)
//
// `new Date()` on the timestamptz shape is fine in V8 but returns Invalid
// Date in Safari — and agents live on iPhones — so every parse of a DB
// temporal value must go through here rather than calling `new Date(value)`
// directly.

/** Parse any DB temporal string (timestamptz text, date, or ISO). */
export function parseDbTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;

  // Date-only: construct at local midnight so day arithmetic and display
  // agree with what the person typed, regardless of their timezone.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }

  // Postgres timestamptz text: swap the space for a T and normalise the
  // offset ("+00" -> "+00:00") so the result is strict ISO 8601, which every
  // engine parses identically.
  const pg = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2}(?::?\d{2})?)?$/.exec(s);
  if (pg) {
    let offset = pg[3] ?? "+00:00";
    if (/^[+-]\d{2}$/.test(offset)) offset = `${offset}:00`;
    else if (/^[+-]\d{4}$/.test(offset)) offset = `${offset.slice(0, 3)}:${offset.slice(3)}`;
    return new Date(`${pg[1]}T${pg[2]}${offset}`);
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Epoch millis of a DB temporal string, or null when absent/unparseable. */
export function dbTimeMs(value: string | null | undefined): number | null {
  const parsed = parseDbTime(value);
  return parsed ? parsed.getTime() : null;
}

/** All Portal business dates use New York, including automatic DST changes.
 * Keep instants stored as UTC; convert only when deriving/displaying a date.
 * A DATE value is already a calendar date and must never be shifted. */
export const BUSINESS_TIME_ZONE = "America/New_York";

const businessDayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

/** New York "YYYY-MM-DD" for an instant; preserves a date-only value verbatim. */
export function dbDatePart(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const date = value instanceof Date ? value : parseDbTime(value);
  if (!date || !Number.isFinite(date.getTime())) return "";
  const parts = businessDayFormatter.formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function businessToday(now = new Date()): string {
  return dbDatePart(now);
}

/** Payment APIs also accept a calendar day without a known payment time.
 * Match the offline-receipt convention: use noon UTC as a date-only anchor,
 * which remains on the supplied New York day in both EST and EDT. An actual
 * timestamp keeps its original instant. Never treat a DATE as UTC midnight. */
export function parsePaymentTime(value: string): Date | null {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? date : null;
  }
  const date = parseDbTime(text);
  return date && Number.isFinite(date.getTime()) ? date : null;
}

/** Calendar arithmetic, not elapsed 24-hour periods (DST days are 23/25 hours). */
export function addCalendarDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || !Number.isInteger(days)) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Difference between New York calendar days, independent of host timezone/DST. */
export function calendarDaysBetween(from: string | Date, to: string | Date): number | null {
  const start = dbDatePart(from);
  const end = dbDatePart(to);
  if (!start || !end) return null;
  const days = (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000;
  return Number.isFinite(days) ? days : null;
}

/** Date-only display with the requested locale/style, after NY date conversion. */
export function formatBusinessDate(
  value: string | null | undefined,
  locale = "en-US",
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
): string {
  const day = dbDatePart(value);
  if (!day) return value || "";
  const date = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value || "";
  // Once a calendar day has been selected, format it without another zone shift.
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" })
    .format(date);
}

export function formatBusinessTimestamp(
  value: string | null | undefined,
  locale = "en-US",
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  const date = parseDbTime(value);
  if (!date || !Number.isFinite(date.getTime())) return value || "";
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: BUSINESS_TIME_ZONE }).format(date);
}

export function fmtDate(value?: string | null): string {
  const day = dbDatePart(value);
  return day ? `${day.slice(5, 7)}/${day.slice(8, 10)}/${day.slice(0, 4)}` : value || "";
}

export function fmtLongDate(value?: string | null): string {
  return formatBusinessDate(value, "en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** "YYYY-MM" month key of a DB temporal string, or "". */
export function dbMonthKey(value: string | Date | null | undefined): string {
  const day = dbDatePart(value);
  return day ? day.slice(0, 7) : "";
}

/** "MM/DD/YYYY HH:MM" of a DB instant, or "" when absent/unparseable. */
export function fmtTimestamp(value: string | null | undefined): string {
  const d = parseDbTime(value);
  if (!d || !Number.isFinite(d.getTime())) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value!.trim())) return `${fmtDate(value)} 00:00`;
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(d);
  return `${fmtDate(value)} ${time}`;
}

/** Normalize a request-supplied calendar-date value for a DATE column:
 *  "YYYY-MM-DD" passes through, anything else (empty string, junk, undefined)
 *  becomes null — Postgres would reject it with a 22007 otherwise. */
export function dateOrNull(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
