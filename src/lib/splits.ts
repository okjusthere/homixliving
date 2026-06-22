export const DEFAULT_AGENT_SPLIT_PCT = 80;

export function normalizeSplitPct(value: number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_AGENT_SPLIT_PCT;
  return Math.min(100, Math.max(0, parsed));
}

export function companySplitPct(agentSplitPct: number | null | undefined) {
  return 100 - normalizeSplitPct(agentSplitPct);
}

export function splitLabel(agentSplitPct: number | null | undefined) {
  const agentPct = normalizeSplitPct(agentSplitPct);
  return `${agentPct}/${100 - agentPct}`;
}
