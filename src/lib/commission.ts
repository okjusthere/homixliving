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
  return Number.isFinite(value) ? roundCents(Math.max(0, value)) : 0;
}

function percentInput(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

/** Round to cents, canonicalizing float noise (0.30000000000000004 → 0.3). */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeCommission(input: CommissionInput): CommissionBreakdown {
  const totalCommission = moneyInput(input.totalCommission);

  const rawReferrerCut =
    input.referrer?.type === "percent"
      ? totalCommission * (percentInput(input.referrer.amount) / 100)
      : input.referrer?.type === "flat"
      ? moneyInput(input.referrer.amount)
      : 0;
  const referrerCut = roundCents(Math.min(totalCommission, rawReferrerCut));
  const afterReferrer = roundCents(totalCommission - referrerCut);

  // Every persisted/displayed figure is cents-exact. Grosses are allocated
  // with the largest-remainder method so they sum EXACTLY to the (rounded)
  // pool they came from — no penny drift between a displayed total and the
  // sum of its displayed parts.
  const normalized = input.agents.map((agent) => ({
    ...agent,
    sharePct: percentInput(agent.sharePct),
    splitPct: percentInput(agent.splitPct),
    isPrimary: Boolean(agent.isPrimary),
  }));
  const rawGrosses = normalized.map(
    (agent) => afterReferrer * (agent.sharePct / 100)
  );
  const targetCents = Math.round(
    rawGrosses.reduce((sum, g) => sum + g, 0) * 100
  );
  const floorCents = rawGrosses.map((g) => Math.floor(g * 100 + 1e-9));
  let leftover = targetCents - floorCents.reduce((sum, c) => sum + c, 0);
  const byRemainder = rawGrosses
    .map((g, i) => ({ i, rem: g * 100 - Math.floor(g * 100 + 1e-9) }))
    .sort((a, b) => b.rem - a.rem);
  for (const { i } of byRemainder) {
    if (leftover <= 0) break;
    floorCents[i] += 1;
    leftover -= 1;
  }

  const agentRows = normalized.map((agent, i) => {
    const gross = floorCents[i] / 100;
    const agentTake = roundCents(gross * (agent.splitPct / 100));
    const companyPool = roundCents(gross - agentTake);
    return { ...agent, gross, agentTake, companyPool };
  });

  return {
    totalCommission,
    referrerCut,
    afterReferrer,
    agents: agentRows,
    companyPoolTotal: roundCents(
      agentRows.reduce((sum, agent) => sum + agent.companyPool, 0)
    ),
    agentTakeTotal: roundCents(
      agentRows.reduce((sum, agent) => sum + agent.agentTake, 0)
    ),
  };
}
