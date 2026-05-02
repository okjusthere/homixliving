import assert from "node:assert/strict";
import { computeCommission, type CommissionBreakdown } from "../commission";

function assertClose(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${label}: expected ${expected}, got ${actual}`);
}

function agentTake(actual: CommissionBreakdown, agentId: number) {
  return actual.agents.find((agent) => agent.agentId === agentId)?.agentTake || 0;
}

function agentGross(actual: CommissionBreakdown, agentId: number) {
  return actual.agents.find((agent) => agent.agentId === agentId)?.gross || 0;
}

function assertBreakdown(
  actual: CommissionBreakdown,
  expected: {
    referrerCut?: number;
    afterReferrer?: number;
    companyPoolTotal?: number;
    agentTakeTotal?: number;
    agents?: Record<number, { gross?: number; take?: number }>;
  }
) {
  if (expected.referrerCut !== undefined) {
    assertClose(actual.referrerCut, expected.referrerCut, "referrerCut");
  }
  if (expected.afterReferrer !== undefined) {
    assertClose(actual.afterReferrer, expected.afterReferrer, "afterReferrer");
  }
  if (expected.companyPoolTotal !== undefined) {
    assertClose(actual.companyPoolTotal, expected.companyPoolTotal, "companyPoolTotal");
  }
  if (expected.agentTakeTotal !== undefined) {
    assertClose(actual.agentTakeTotal, expected.agentTakeTotal, "agentTakeTotal");
  }
  for (const [rawAgentId, values] of Object.entries(expected.agents || {})) {
    const agentId = Number(rawAgentId);
    if (values.gross !== undefined) {
      assertClose(agentGross(actual, agentId), values.gross, `agent ${agentId} gross`);
    }
    if (values.take !== undefined) {
      assertClose(agentTake(actual, agentId), values.take, `agent ${agentId} take`);
    }
  }
  assertClose(
    actual.referrerCut + actual.agentTakeTotal + actual.companyPoolTotal,
    actual.totalCommission,
    "reconciles to total"
  );
}

assertBreakdown(
  computeCommission({
    totalCommission: 5000,
    agents: [{ agentId: 1, sharePct: 100, splitPct: 70, isPrimary: true }],
  }),
  {
    referrerCut: 0,
    companyPoolTotal: 1500,
    agentTakeTotal: 3500,
    agents: { 1: { gross: 5000, take: 3500 } },
  }
);

assertBreakdown(
  computeCommission({
    totalCommission: 5000,
    referrer: { type: "percent", amount: 10 },
    agents: [{ agentId: 1, sharePct: 100, splitPct: 70, isPrimary: true }],
  }),
  {
    referrerCut: 500,
    afterReferrer: 4500,
    companyPoolTotal: 1350,
    agentTakeTotal: 3150,
    agents: { 1: { gross: 4500, take: 3150 } },
  }
);

assertBreakdown(
  computeCommission({
    totalCommission: 5000,
    referrer: { type: "flat", amount: 250 },
    agents: [{ agentId: 1, sharePct: 100, splitPct: 60, isPrimary: true }],
  }),
  {
    referrerCut: 250,
    afterReferrer: 4750,
    companyPoolTotal: 1900,
    agentTakeTotal: 2850,
    agents: { 1: { gross: 4750, take: 2850 } },
  }
);

assertBreakdown(
  computeCommission({
    totalCommission: 5000,
    agents: [
      { agentId: 1, sharePct: 60, splitPct: 70, isPrimary: true },
      { agentId: 2, sharePct: 40, splitPct: 60 },
    ],
  }),
  {
    companyPoolTotal: 1700,
    agentTakeTotal: 3300,
    agents: {
      1: { gross: 3000, take: 2100 },
      2: { gross: 2000, take: 1200 },
    },
  }
);

assertBreakdown(
  computeCommission({
    totalCommission: 5000,
    referrer: { type: "percent", amount: 10 },
    agents: [
      { agentId: 1, sharePct: 50, splitPct: 70, isPrimary: true },
      { agentId: 2, sharePct: 30, splitPct: 60 },
      { agentId: 3, sharePct: 20, splitPct: 50 },
    ],
  }),
  {
    referrerCut: 500,
    afterReferrer: 4500,
    companyPoolTotal: 1665,
    agentTakeTotal: 2835,
    agents: {
      1: { gross: 2250, take: 1575 },
      2: { gross: 1350, take: 810 },
      3: { gross: 900, take: 450 },
    },
  }
);

assertBreakdown(
  computeCommission({
    totalCommission: 5000,
    agents: [{ agentId: 1, sharePct: 100, splitPct: 100, isPrimary: true }],
  }),
  {
    companyPoolTotal: 0,
    agentTakeTotal: 5000,
    agents: { 1: { gross: 5000, take: 5000 } },
  }
);

console.log("commission tests passed");
