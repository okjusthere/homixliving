import assert from "node:assert/strict";
import { parseDbTime, dbTimeMs, dbDatePart, dbMonthKey } from "../db-time";

// timestamptz text renderings (session pinned to UTC, but tolerate offsets)
const tz = parseDbTime("2026-07-28 01:14:31.123+00");
assert.ok(tz && !Number.isNaN(tz.getTime()), "pg timestamptz text parses");
assert.equal(tz!.toISOString(), "2026-07-28T01:14:31.123Z");

assert.equal(parseDbTime("2026-07-28 01:14:31+00")!.toISOString(), "2026-07-28T01:14:31.000Z");
assert.equal(parseDbTime("2026-07-28 01:14:31.5+00")!.toISOString(), "2026-07-28T01:14:31.500Z");
assert.equal(parseDbTime("2026-07-27 21:14:31-04")!.toISOString(), "2026-07-28T01:14:31.000Z");
assert.equal(parseDbTime("2026-07-28 06:44:31+0530")!.toISOString(), "2026-07-28T01:14:31.000Z");
// No offset at all (plain timestamp column, should not happen but must not NaN)
assert.equal(parseDbTime("2026-07-28 01:14:31")!.toISOString(), "2026-07-28T01:14:31.000Z");

// Legacy ISO strings written by the app itself
assert.equal(parseDbTime("2026-07-28T01:14:31.123Z")!.toISOString(), "2026-07-28T01:14:31.123Z");

// date-only: local midnight, so the calendar day survives display in any TZ
const day = parseDbTime("2026-07-28")!;
assert.equal(day.getFullYear(), 2026);
assert.equal(day.getMonth(), 6);
assert.equal(day.getDate(), 28);

// absent / junk
assert.equal(parseDbTime(null), null);
assert.equal(parseDbTime(""), null);
assert.equal(parseDbTime("not a date"), null);
assert.equal(dbTimeMs(undefined), null);

// date-part / month-key work on every shape
for (const shape of ["2026-07-28 01:14:31.123+00", "2026-07-28T01:14:31.123Z", "2026-07-28"]) {
  assert.equal(dbDatePart(shape), "2026-07-28", shape);
  assert.equal(dbMonthKey(shape), "2026-07", shape);
}
assert.equal(dbDatePart(null), "");
assert.equal(dbMonthKey("junk"), "");

console.log("db-time tests passed");
