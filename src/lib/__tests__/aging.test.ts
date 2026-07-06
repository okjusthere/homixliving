import assert from "node:assert/strict";
import {
  bucketFor,
  daysSince,
  emptyAgingSummary,
  isOutstanding,
  summarize,
  totalOutstanding,
} from "../aging";

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

async function main() {
  // daysSince
  assert.equal(daysSince(null), null);
  assert.equal(daysSince("not-a-date"), null);
  assert.equal(daysSince(daysAgoIso(0)), 0);
  assert.equal(daysSince(daysAgoIso(45)), 45);

  // bucketFor boundaries: 30/60/90 are exclusive lower bounds of the next bucket
  assert.equal(bucketFor(null), null);
  assert.equal(bucketFor(0), "0-30");
  assert.equal(bucketFor(29), "0-30");
  assert.equal(bucketFor(30), "30-60");
  assert.equal(bucketFor(59), "30-60");
  assert.equal(bucketFor(60), "60-90");
  assert.equal(bucketFor(89), "60-90");
  assert.equal(bucketFor(90), "90+");
  assert.equal(bucketFor(400), "90+");

  // isOutstanding: only "sent" counts — draft/paid/failed are not receivables
  assert.equal(isOutstanding({ status: "sent" }), true);
  assert.equal(isOutstanding({ status: "draft" }), false);
  assert.equal(isOutstanding({ status: "paid" }), false);
  assert.equal(isOutstanding({ status: "failed" }), false);

  // summarize buckets amounts and skips non-outstanding + unsent rows
  const summary = summarize([
    { status: "sent", sentAt: daysAgoIso(5), totalAmount: 1000 },
    { status: "sent", sentAt: daysAgoIso(35), totalAmount: 2000 },
    { status: "sent", sentAt: daysAgoIso(65), totalAmount: 3000 },
    { status: "sent", sentAt: daysAgoIso(120), totalAmount: 4000 },
    { status: "sent", sentAt: daysAgoIso(121), totalAmount: 500 },
    { status: "paid", sentAt: daysAgoIso(120), totalAmount: 999999 }, // paid — excluded
    { status: "sent", sentAt: null, totalAmount: 777 }, // never sent — no bucket
  ]);
  assert.deepEqual(summary["0-30"], { count: 1, total: 1000 });
  assert.deepEqual(summary["30-60"], { count: 1, total: 2000 });
  assert.deepEqual(summary["60-90"], { count: 1, total: 3000 });
  assert.deepEqual(summary["90+"], { count: 2, total: 4500 });

  const total = totalOutstanding(summary);
  assert.equal(total.count, 5);
  assert.equal(total.total, 10500);

  // empty summary sums to zero
  const empty = totalOutstanding(emptyAgingSummary());
  assert.deepEqual(empty, { count: 0, total: 0 });

  console.log("aging tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
