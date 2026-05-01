import assert from "node:assert/strict";
import { computeCommission, type CommissionBreakdown } from "../commission";

function assertClose(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${label}: expected ${expected}, got ${actual}`);
}

function assertBreakdown(
  actual: CommissionBreakdown,
  expected: Partial<CommissionBreakdown>
) {
  for (const [key, value] of Object.entries(expected)) {
    assertClose(actual[key as keyof CommissionBreakdown], value, key);
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
    primaryAgentSharePct: 100,
    primaryAgentSplitPct: 70,
  }),
  {
    referrerCut: 0,
    primaryGross: 5000,
    primaryAgentTake: 3500,
    primaryCompanyPool: 1500,
    coAgentGross: 0,
    companyPoolTotal: 1500,
    agentTakeTotal: 3500,
  }
);

assertBreakdown(
  computeCommission({
    totalCommission: 5000,
    referrer: { type: "percent", amount: 10 },
    primaryAgentSharePct: 100,
    primaryAgentSplitPct: 70,
  }),
  {
    referrerCut: 500,
    afterReferrer: 4500,
    primaryAgentTake: 3150,
    primaryCompanyPool: 1350,
  }
);

assertBreakdown(
  computeCommission({
    totalCommission: 5000,
    referrer: { type: "flat", amount: 250 },
    primaryAgentSharePct: 100,
    primaryAgentSplitPct: 60,
  }),
  {
    referrerCut: 250,
    afterReferrer: 4750,
    primaryAgentTake: 2850,
    primaryCompanyPool: 1900,
  }
);

assertBreakdown(
  computeCommission({
    totalCommission: 5000,
    primaryAgentSharePct: 60,
    primaryAgentSplitPct: 70,
    coAgent: { sharePct: 40, splitPct: 60 },
  }),
  {
    primaryGross: 3000,
    primaryAgentTake: 2100,
    primaryCompanyPool: 900,
    coAgentGross: 2000,
    coAgentTake: 1200,
    coCompanyPool: 800,
    agentTakeTotal: 3300,
    companyPoolTotal: 1700,
  }
);

assertBreakdown(
  computeCommission({
    totalCommission: 5000,
    referrer: { type: "percent", amount: 10 },
    primaryAgentSharePct: 60,
    primaryAgentSplitPct: 70,
    coAgent: { sharePct: 40, splitPct: 60 },
  }),
  {
    referrerCut: 500,
    afterReferrer: 4500,
    primaryGross: 2700,
    primaryAgentTake: 1890,
    primaryCompanyPool: 810,
    coAgentGross: 1800,
    coAgentTake: 1080,
    coCompanyPool: 720,
    agentTakeTotal: 2970,
    companyPoolTotal: 1530,
  }
);

assertBreakdown(
  computeCommission({
    totalCommission: 5000,
    primaryAgentSharePct: 100,
    primaryAgentSplitPct: 100,
  }),
  {
    primaryAgentTake: 5000,
    primaryCompanyPool: 0,
    coAgentGross: 0,
    companyPoolTotal: 0,
    agentTakeTotal: 5000,
  }
);

console.log("commission tests passed");
