import assert from "node:assert/strict";
import type { Deal } from "@/db/schema";
import { daysUntil, isUpcoming, renewalWindow } from "../renewals";

function inDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function deal(overrides: Partial<Deal>): Deal {
  return {
    status: "active",
    leaseEndDate: inDays(45),
    renewalStatus: null,
    ...overrides,
  } as Deal;
}

async function main() {
  // daysUntil
  assert.equal(daysUntil(null), null);
  assert.equal(daysUntil("garbage"), null);
  const d20 = daysUntil(inDays(20));
  assert.ok(d20 !== null && d20 >= 19 && d20 <= 21, `expected ~20, got ${d20}`);

  // renewalWindow buckets
  assert.equal(renewalWindow(null), null);
  assert.equal(renewalWindow(-1), "overdue");
  assert.equal(renewalWindow(0), "30");
  assert.equal(renewalWindow(30), "30");
  assert.equal(renewalWindow(31), "60");
  assert.equal(renewalWindow(60), "60");
  assert.equal(renewalWindow(61), "90");
  assert.equal(renewalWindow(90), "90");
  assert.equal(renewalWindow(91), null);

  // isUpcoming: active + lease end within 90d + unresolved
  assert.equal(isUpcoming(deal({})), true);
  assert.equal(isUpcoming(deal({ status: "cancelled" })), false);
  assert.equal(isUpcoming(deal({ status: "completed" })), false);
  assert.equal(isUpcoming(deal({ leaseEndDate: null })), false);
  assert.equal(isUpcoming(deal({ leaseEndDate: inDays(120) })), false);
  assert.equal(isUpcoming(deal({ renewalStatus: "renewed" })), false);
  assert.equal(isUpcoming(deal({ renewalStatus: "lost" })), false);
  assert.equal(isUpcoming(deal({ renewalStatus: "renewing" })), true);
  // overdue lease still counts as upcoming work
  assert.equal(isUpcoming(deal({ leaseEndDate: inDays(-5) })), true);

  console.log("renewals tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
