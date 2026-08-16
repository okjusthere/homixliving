import { normalizeAgentPlan, type AgentPlan } from "@/lib/agent-plans";

export const COMPENSATION_POLICY_VERSION = "3.1";
export type CompensationSource = "self" | "team" | "homix_rental" | "homix_sales" | "outside";

export type CompensationParticipant = {
  agentId: number;
  sharePct: number;
  plan: AgentPlan | string;
  companyCapUsed: number;
  teamId?: number | null;
  teamConfigId?: number | null;
  teamLeaderAgentId?: number | null;
  sponsorAgentId?: number | null;
  teamSplitPct?: number | null;
  teamCapAmount?: number | null;
  teamCapUsed?: number;
};

export type CompensationInput = {
  dealType: "rental" | "sale";
  grossCommission: number;
  source: CompensationSource;
  outsideReferralAmount?: number;
  rebateAmount?: number;
  participants: CompensationParticipant[];
};

export type CompensationAllocation = CompensationParticipant & {
  plan: AgentPlan;
  grossShare: number;
  companyDollar: number;
  companyCapCredit: number;
  teamLeaderAllocation: number;
  teamCapCredit: number;
  transactionFee: number;
  rebateAmount: number;
  sponsorAmount: number;
  agentNet: number;
};

export type CompensationResult = {
  policyVersion: typeof COMPENSATION_POLICY_VERSION;
  grossCommission: number;
  source: CompensationSource;
  sourceFee: number;
  outsideReferral: number;
  commissionBase: number;
  companyDollar: number;
  teamAllocation: number;
  transactionFee: number;
  rebateAmount: number;
  sponsorAmount: number;
  agentNetTotal: number;
  homixRetained: number;
  allocations: CompensationAllocation[];
};

const PLAN_RULES: Record<AgentPlan, { companyRate: number; companyCap: number | null }> = {
  solo: { companyRate: 0.15, companyCap: 12_000 },
  solo_pro: { companyRate: 0, companyCap: null },
  team_member: { companyRate: 0.1, companyCap: 10_000 },
  team_leader: { companyRate: 0, companyCap: null },
  holding: { companyRate: 0, companyCap: null },
  legacy_growth: { companyRate: 0.08, companyCap: null },
};

function cents(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, value) * 100) / 100;
}

function pct(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Number(value))) / 100;
}

function allocate(pool: number, weights: number[]) {
  const poolCents = Math.round(cents(pool) * 100);
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (poolCents <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((weight) => (poolCents * Math.max(0, weight)) / total);
  const result = raw.map(Math.floor);
  let remainder = poolCents - result.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const row of order) {
    if (remainder <= 0) break;
    result[row.index] += 1;
    remainder -= 1;
  }
  return result.map((value) => value / 100);
}

export function transactionFeeFor(checkAmount: number) {
  const amount = cents(checkAmount);
  if (amount <= 0) return 0;
  if (amount <= 30_000) return 200;
  if (amount <= 100_000) return 500;
  return 1_000;
}

export function computeCompensationV31(input: CompensationInput): CompensationResult {
  const grossCommission = cents(input.grossCommission);
  const normalized = input.participants.map((participant) => ({
    ...participant,
    plan: normalizeAgentPlan(participant.plan),
    sharePct: Math.min(100, Math.max(0, Number(participant.sharePct) || 0)),
    companyCapUsed: cents(participant.companyCapUsed),
    teamCapUsed: cents(participant.teamCapUsed || 0),
  }));
  const shareWeights = normalized.map((participant) => participant.sharePct);
  const sourceRate = input.source === "homix_rental" ? 0.15 : input.source === "homix_sales" ? 0.25 : 0;
  const sourceFee = cents(grossCommission * sourceRate);
  const outsideReferral = cents(
    Math.min(grossCommission - sourceFee, input.source === "outside" ? input.outsideReferralAmount || 0 : 0),
  );
  const commissionBase = cents(grossCommission - sourceFee - outsideReferral);
  const grossShares = allocate(commissionBase, shareWeights);
  const sourceShares = allocate(sourceFee, shareWeights);

  let allocations: CompensationAllocation[] = normalized.map((participant, index) => {
    const rule = PLAN_RULES[participant.plan];
    const uncappedCompanyDollar = cents(grossShares[index] * rule.companyRate);
    const remainingCompanyCap = rule.companyCap == null
      ? null
      : cents(Math.max(0, rule.companyCap - participant.companyCapUsed));
    const companyDollar = remainingCompanyCap == null
      ? uncappedCompanyDollar
      : cents(Math.min(uncappedCompanyDollar, remainingCompanyCap));
    const agentSide = cents(grossShares[index] - companyDollar);
    const isTeamMember = participant.plan === "team_member" && participant.teamId != null;
    const rawTeamAllocation = isTeamMember ? cents(agentSide * pct(participant.teamSplitPct || 10)) : 0;
    const remainingTeamCap = participant.teamCapAmount == null
      ? null
      : cents(Math.max(0, participant.teamCapAmount - (participant.teamCapUsed || 0)));
    const teamLeaderAllocation = remainingTeamCap == null
      ? rawTeamAllocation
      : cents(Math.min(rawTeamAllocation, remainingTeamCap));
    const sponsorAmount = participant.sponsorAgentId
      ? cents((sourceShares[index] + companyDollar) * 0.1)
      : 0;
    return {
      ...participant,
      grossShare: grossShares[index],
      companyDollar,
      companyCapCredit: companyDollar,
      teamLeaderAllocation,
      teamCapCredit: teamLeaderAllocation,
      transactionFee: 0,
      rebateAmount: 0,
      sponsorAmount,
      agentNet: cents(agentSide - teamLeaderAllocation),
    };
  });

  // A cap-crossing transaction still creates Company Dollar, so it does not
  // also pay a transaction fee. The fee begins on the next transaction.
  const companyDollar = cents(allocations.reduce((sum, row) => sum + row.companyDollar, 0));
  const transactionFee = companyDollar === 0 ? transactionFeeFor(grossCommission) : 0;
  if (transactionFee > 0) {
    const feeShares = allocate(transactionFee, allocations.map((row) => row.agentNet));
    allocations = allocations.map((row, index) => ({
      ...row,
      transactionFee: feeShares[index],
      agentNet: cents(row.agentNet - feeShares[index]),
    }));
  }

  // Without an approved rebate program, v3.1 makes the participants fund it.
  const requestedRebate = cents(input.rebateAmount || 0);
  const payableNet = allocations.reduce((sum, row) => sum + row.agentNet, 0);
  const rebateAmount = cents(Math.min(requestedRebate, payableNet));
  if (rebateAmount > 0) {
    const rebateShares = allocate(rebateAmount, allocations.map((row) => row.agentNet));
    allocations = allocations.map((row, index) => ({
      ...row,
      rebateAmount: rebateShares[index],
      agentNet: cents(row.agentNet - rebateShares[index]),
    }));
  }

  const teamAllocation = cents(allocations.reduce((sum, row) => sum + row.teamLeaderAllocation, 0));
  const sponsorAmount = cents(allocations.reduce((sum, row) => sum + row.sponsorAmount, 0));
  const agentNetTotal = cents(allocations.reduce((sum, row) => sum + row.agentNet, 0));
  const homixRetained = cents(sourceFee + companyDollar + transactionFee - sponsorAmount);

  return {
    policyVersion: COMPENSATION_POLICY_VERSION,
    grossCommission,
    source: input.source,
    sourceFee,
    outsideReferral,
    commissionBase,
    companyDollar,
    teamAllocation,
    transactionFee,
    rebateAmount,
    sponsorAmount,
    agentNetTotal,
    homixRetained,
    allocations,
  };
}
