export type CommissionAgentInput = {
  agentId: number;
  name?: string | null;
  sharePct: number;
  splitPct: number;
  isPrimary?: boolean;
};

export type CommissionInput = {
  totalCommission: number;
  referrer?: { type: "percent" | "flat"; amount: number } | null;
  agents: CommissionAgentInput[];
};

export type CommissionAgentBreakdown = CommissionAgentInput & {
  gross: number;
  agentTake: number;
  companyPool: number;
};

export type CommissionBreakdown = {
  totalCommission: number;
  referrerCut: number;
  afterReferrer: number;
  agents: CommissionAgentBreakdown[];
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

  const rawReferrerCut =
    input.referrer?.type === "percent"
      ? totalCommission * (percentInput(input.referrer.amount) / 100)
      : input.referrer?.type === "flat"
      ? moneyInput(input.referrer.amount)
      : 0;
  const referrerCut = Math.min(totalCommission, rawReferrerCut);
  const afterReferrer = totalCommission - referrerCut;

  const agentRows = input.agents.map((agent) => {
    const sharePct = percentInput(agent.sharePct);
    const splitPct = percentInput(agent.splitPct);
    const gross = afterReferrer * (sharePct / 100);
    const agentTake = gross * (splitPct / 100);
    const companyPool = gross - agentTake;

    return {
      ...agent,
      sharePct,
      splitPct,
      gross,
      agentTake,
      companyPool,
      isPrimary: Boolean(agent.isPrimary),
    };
  });

  return {
    totalCommission,
    referrerCut,
    afterReferrer,
    agents: agentRows,
    companyPoolTotal: agentRows.reduce((sum, agent) => sum + agent.companyPool, 0),
    agentTakeTotal: agentRows.reduce((sum, agent) => sum + agent.agentTake, 0),
  };
}
