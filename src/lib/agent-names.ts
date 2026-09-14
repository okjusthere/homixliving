/** Portal `name` is the agent's complete Preferred name, not a legal identity. */
export type AgentNames = { name: string; legalName?: string | null };

export function cleanAgentName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
}

export function validAgentName(value: unknown): value is string {
  return typeof value === "string" && Boolean(cleanAgentName(value)) &&
    value.length <= 200 && !/[\u0000-\u001f\u007f]/u.test(value);
}

/**
 * Compact the website label only; never rewrite either stored identity.
 * Remove an exact shared trailing name (including compound family names),
 * leaving at least one word on each side. Different/reversed/unknown surnames
 * are not guessed. Portal and posters still use the complete Preferred name.
 */
export function websiteAgentName(agent: AgentNames): string {
  const legal = cleanAgentName(agent.legalName);
  const preferred = cleanAgentName(agent.name);
  // Legacy records without a verified legal name remain usable, and are
  // flagged for review in the admin UI rather than inventing legal identity.
  if (!legal) return preferred;
  if (!preferred || legal.toLocaleLowerCase("en-US") === preferred.toLocaleLowerCase("en-US")) return legal;
  const legalWords = legal.split(" ");
  const preferredWords = preferred.split(" ");
  while (legalWords.length > 1 && preferredWords.length > 1 &&
    legalWords.at(-1)!.toLocaleLowerCase("en-US") === preferredWords.at(-1)!.toLocaleLowerCase("en-US")) {
    legalWords.pop();
    preferredWords.pop();
  }
  return `${legal} (${preferredWords.join(" ")})`;
}

export function hasSignedNameBasis(agent: {
  agreementStatus?: string | null;
  signingPreparation?: unknown;
  onboardingManualContract?: unknown;
}): boolean {
  return Boolean(agent.signingPreparation || agent.onboardingManualContract ||
    (agent.agreementStatus && agent.agreementStatus !== "not_started"));
}
