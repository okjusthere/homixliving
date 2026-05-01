export type CommissionInput = {
  totalCommission: number;
  referrer?: { type: "percent" | "flat"; amount: number } | null;
  primaryAgentSharePct: number;
  primaryAgentSplitPct: number;
  coAgent?: { sharePct: number; splitPct: number } | null;
};

export type CommissionBreakdown = {
  totalCommission: number;
  referrerCut: number;
  afterReferrer: number;
  primaryGross: number;
  primaryAgentTake: number;
  primaryCompanyPool: number;
  coAgentGross: number;
  coAgentTake: number;
  coCompanyPool: number;
  companyPoolTotal: number;
  agentTakeTotal: number;
};

function moneyInput(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function percentInput(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

export function computeCommission(input: CommissionInput): CommissionBreakdown {
  const totalCommission = moneyInput(input.totalCommission);
  const primaryAgentSharePct = percentInput(input.primaryAgentSharePct);
  const primaryAgentSplitPct = percentInput(input.primaryAgentSplitPct);

  const rawReferrerCut =
    input.referrer?.type === "percent"
      ? totalCommission * (percentInput(input.referrer.amount) / 100)
      : input.referrer?.type === "flat"
      ? moneyInput(input.referrer.amount)
      : 0;
  const referrerCut = Math.min(totalCommission, rawReferrerCut);
  const afterReferrer = totalCommission - referrerCut;

  const primaryGross = afterReferrer * (primaryAgentSharePct / 100);
  const primaryAgentTake = primaryGross * (primaryAgentSplitPct / 100);
  const primaryCompanyPool = primaryGross - primaryAgentTake;

  const coAgentGross = input.coAgent ? afterReferrer - primaryGross : 0;
  const coAgentSplitPct = input.coAgent ? percentInput(input.coAgent.splitPct) : 0;
  const coAgentTake = coAgentGross * (coAgentSplitPct / 100);
  const coCompanyPool = coAgentGross - coAgentTake;

  return {
    totalCommission,
    referrerCut,
    afterReferrer,
    primaryGross,
    primaryAgentTake,
    primaryCompanyPool,
    coAgentGross,
    coAgentTake,
    coCompanyPool,
    companyPoolTotal: primaryCompanyPool + coCompanyPool,
    agentTakeTotal: primaryAgentTake + coAgentTake,
  };
}
