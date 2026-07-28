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

/** "YYYY-MM-DD" of a DB temporal string (its date part), or "". */
export function dbDatePart(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return m ? m[1] : "";
}

/** "YYYY-MM" month key of a DB temporal string, or "". */
export function dbMonthKey(value: string | null | undefined): string {
  const day = dbDatePart(value);
  return day ? day.slice(0, 7) : "";
}

/** "MM/DD/YYYY HH:MM" of a DB instant, or "" when absent/unparseable. */
export function fmtTimestamp(value: string | null | undefined): string {
  const d = parseDbTime(value);
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Normalize a request-supplied calendar-date value for a DATE column:
 *  "YYYY-MM-DD" passes through, anything else (empty string, junk, undefined)
 *  becomes null — Postgres would reject it with a 22007 otherwise. */
export function dateOrNull(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
