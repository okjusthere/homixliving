import assert from "node:assert/strict";
import {
  activeDeal,
  commissionAgentsForDeal,
  dealInMonth,
  dealInYear,
  getAgentTakeForDeal,
  getDealDate,
  getMonthKey,
} from "../reporting";

async function main() {
  // getMonthKey formats YYYY-MM with zero padding
  assert.equal(getMonthKey(new Date(2026, 0, 15)), "2026-01");
  assert.equal(getMonthKey(new Date(2026, 11, 1)), "2026-12");

  // getDealDate prefers dealDate, falls back to createdAt
  assert.equal(getDealDate({ dealDate: "2026-05-01", createdAt: "2026-06-09" }), "2026-05-01");
  assert.equal(getDealDate({ dealDate: null, createdAt: "2026-06-09T10:00:00Z" }), "2026-06-09T10:00:00Z");
  assert.equal(getDealDate({ dealDate: null, createdAt: null }), "");

  // month / year membership is prefix-based
  assert.equal(dealInMonth({ dealDate: "2026-05-15", createdAt: null }, "2026-05"), true);
  assert.equal(dealInMonth({ dealDate: "2026-05-15", createdAt: null }, "2026-06"), false);
  assert.equal(dealInYear({ dealDate: "2026-05-15", createdAt: null }, "2026"), true);
  assert.equal(dealInYear({ dealDate: "2025-12-31", createdAt: null }, "2026"), false);

  // only cancelled deals are excluded
  assert.equal(activeDeal({ status: "active" }), true);
  assert.equal(activeDeal({ status: "completed" }), true);
  assert.equal(activeDeal({ status: "cancelled" }), false);

  // commissionAgentsForDeal joins deal participants with roster split
  const participants = commissionAgentsForDeal({
    dealId: 7,
    dealAgents: [
      { dealId: 7, agentId: 1, sharePct: 60, isPrimary: true },
      { dealId: 7, agentId: 2, sharePct: 40, isPrimary: false },
      { dealId: 99, agentId: 3, sharePct: 100, isPrimary: true }, // other deal — excluded
    ],
    agents: [
      { id: 1, name: "A", splitPct: 70 },
      { id: 2, name: "B", splitPct: 80 },
    ],
  });
  assert.equal(participants.length, 2);
  assert.deepEqual(
    participants.map((p) => [p.agentId, p.sharePct, p.splitPct, p.isPrimary]),
    [
      [1, 60, 70, true],
      [2, 40, 80, false],
    ]
  );

  // unknown roster agent defaults split to 0 (their take becomes 0, not NaN)
  const orphan = commissionAgentsForDeal({
    dealId: 1,
    dealAgents: [{ dealId: 1, agentId: 42, sharePct: 100 }],
    agents: [],
  });
  assert.equal(orphan[0].splitPct, 0);

  // getAgentTakeForDeal: $10,000, 60% share, 70% split → $4,200; missing agent → 0
  const deal = {
    id: 7,
    totalCommission: 10000,
    referrerType: null,
    referrerAmount: null,
    dealDate: "2026-05-01",
    createdAt: null,
    status: "active",
  };
  assert.equal(getAgentTakeForDeal({ deal, agentId: 1, participants }), 4200);
  assert.equal(getAgentTakeForDeal({ deal, agentId: 999, participants }), 0);

  // referrer reduces the pool before shares: 10% off the top → $9,000 pool.
  // $9,000 × 60% × 70% = $3,780 — and it must come back cents-exact (raw JS
  // float math gives 3779.9999999999995; computeCommission rounds to cents).
  const withReferrer = { ...deal, referrerType: "percent", referrerAmount: 10 };
  assert.equal(
    getAgentTakeForDeal({ deal: withReferrer, agentId: 1, participants }),
    3780
  );

  console.log("reporting tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
