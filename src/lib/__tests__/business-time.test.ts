import assert from "node:assert/strict";
import { addCalendarDays, businessToday, calendarDaysBetween, dbDatePart, dbMonthKey, fmtTimestamp, parsePaymentTime } from "../db-time";
import { daysUntil } from "../renewals";
import { fmtDate, fmtLongDate } from "../../components/homix/tokens";
import { dealInMonth, dealInYear, getMonthKey } from "../reporting";

// The production invoice was created at 8:31 PM New York time on September 16.
// Results must be identical on UTC servers and agents' computers worldwide.
const invoiceCreatedAt = "2026-09-17 00:31:42.191+00";
assert.equal(fmtDate(invoiceCreatedAt), "09/16/2026");
assert.equal(fmtLongDate(invoiceCreatedAt), "September 16, 2026");
assert.equal(dbDatePart(invoiceCreatedAt), "2026-09-16");
assert.equal(fmtTimestamp(invoiceCreatedAt), "09/16/2026 20:31");

for (const [instant, expected] of [
  ["2026-09-17T03:59:59Z", "2026-09-16"],
  ["2026-09-17T04:00:00Z", "2026-09-17"],
  ["2026-01-17T04:59:59Z", "2026-01-16"],
  ["2026-01-17T05:00:00Z", "2026-01-17"],
  ["2026-10-01T01:00:00Z", "2026-09-30"],
  ["2027-01-01T02:00:00Z", "2026-12-31"],
  ["2026-09-17T08:31:42+08:00", "2026-09-16"],
]) {
  assert.equal(dbDatePart(instant), expected, instant);
}

assert.equal(fmtDate("2026-09-18"), "09/18/2026", "entered lease dates never shift");
assert.equal(fmtLongDate("2026-01-01"), "January 1, 2026");
assert.equal(dbDatePart("2026-01-01"), "2026-01-01");
assert.equal(dbMonthKey("2027-01-01T02:00:00Z"), "2026-12");
assert.equal(getMonthKey(new Date("2026-10-01T01:00:00Z")), "2026-09");
assert.equal(dealInMonth({ createdAt: "2026-10-01T01:00:00Z" }, "2026-09"), true);
assert.equal(dealInYear({ createdAt: "2027-01-01T02:00:00Z" }, "2027"), false);

// Both sides of the DST jumps refer to the same calendar day.
assert.equal(fmtTimestamp("2026-03-08T06:59:00Z"), "03/08/2026 01:59");
assert.equal(fmtTimestamp("2026-03-08T07:00:00Z"), "03/08/2026 03:00");
assert.equal(fmtTimestamp("2026-11-01T05:30:00Z"), "11/01/2026 01:30");
assert.equal(fmtTimestamp("2026-11-01T06:30:00Z"), "11/01/2026 01:30");

assert.equal(businessToday(new Date("2026-09-17T00:31:42Z")), "2026-09-16");
assert.equal(addCalendarDays("2026-03-08", 1), "2026-03-09");
assert.equal(addCalendarDays("2026-11-01", 1), "2026-11-02");
assert.equal(addCalendarDays("2026-12-31", 1), "2027-01-01");
assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
assert.equal(calendarDaysBetween("2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z"), 1);
assert.equal(calendarDaysBetween("2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z"), 1);
assert.equal(calendarDaysBetween("2026-09-17T00:31:42Z", "2026-09-18"), 2);
assert.equal(daysUntil(businessToday()), 0);
assert.equal(daysUntil(addCalendarDays(businessToday(), 30)), 30);
assert.equal(daysUntil(addCalendarDays(businessToday(), -1)), -1);
for (const date of ["2026-09-16", "2026-01-01", "2026-03-08", "2026-11-01"]) {
  assert.equal(dbDatePart(parsePaymentTime(date)), date, "date-only receipts keep their entered NY date");
}
assert.equal(parsePaymentTime("2026-09-17T00:31:42Z")?.toISOString(), "2026-09-17T00:31:42.000Z");
assert.equal(parsePaymentTime("2026-02-30"), null);
assert.equal(parsePaymentTime("not a date"), null);
console.log(`business-time regression tests passed (host TZ=${process.env.TZ})`);
