import { cleanAgentName, validAgentName } from "@/lib/agent-names";
import type { SigningPackage } from "@/lib/signing-contract";

export class LegalNameRequired extends Error {
  constructor() { super("LEGAL_NAME_REQUIRED"); }
}

export function requireLegalName(agent: { legalName?: string | null }): string {
  if (!validAgentName(agent.legalName)) throw new LegalNameRequired();
  return cleanAgentName(agent.legalName);
}

/** The package defines owner roles; never trust a browser-supplied role or name. */
export function bindSigningAgentNames(
  input: Record<string, unknown>,
  published: Pick<SigningPackage, "definition">,
  agent: { legalName?: string | null },
) {
  const legalName = requireLegalName(agent);
  const ownerKeys = new Set(published.definition.flatMap((p) => p.roles)
    .filter((r) => r.actor === "owner").map((r) => r.key));
  const recipients = Array.isArray(input.recipients) ? input.recipients.map((r: unknown) => {
    if (!r || typeof r !== "object") return r;
    const person = r as Record<string, unknown>;
    return ownerKeys.has(String(person.key)) ? { ...person, name: legalName } : person;
  }) : input.recipients;
  const values = input.values && typeof input.values === "object" && !Array.isArray(input.values)
    ? input.values as Record<string, unknown> : {};
  return { ...input, recipients, values: { ...values, agent_name: legalName } };
}
