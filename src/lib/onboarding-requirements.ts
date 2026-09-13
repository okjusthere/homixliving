import type {
  Agent,
  LimitedCapability,
  VerifiedManualContract,
} from "@/db/schema";
import { parseDbTime } from "@/lib/db-time";

export type ManualContractBasis = Partial<
  Pick<
    Agent,
    | "onboardingManualContract"
    | "licensedCompany"
    | "plan"
    | "teamTermsConfigId"
    | "legalName"
    | "name"
    | "licenseNumber"
  >
>;

export function verifiedManualContract(
  agent: ManualContractBasis,
): VerifiedManualContract | null {
  const c = agent.onboardingManualContract;
  if (
    !c ||
    !c.verifiedAt ||
    !c.agentSignedAt ||
    c.company !== agent.licensedCompany ||
    c.plan !== agent.plan ||
    c.teamTermsConfigId !== (agent.teamTermsConfigId ?? null) ||
    c.legalName !== (agent.legalName || agent.name) ||
    c.licenseNumber !== (agent.licenseNumber || "")
  )
    return null;
  return c;
}

/** Both parties completed the applicable affiliation contract, by its actual source. */
export function affiliationContractComplete(
  agent: ManualContractBasis & { agreementStatus: string },
) {
  return (
    agent.agreementStatus === "completed" ||
    Boolean(verifiedManualContract(agent)?.companySignedAt)
  );
}

export const LIMITED_CAPABILITIES = [
  "profile",
  "training",
  "resources",
] as const;

export function effectiveAccess(
  agent: { accountStatus: string; isAdmin: boolean },
  grants: Array<{
    status: string;
    expiresAt: string;
    capabilities: LimitedCapability[];
  }>,
  now = new Date(),
) {
  const full = agent.accountStatus === "active";
  const capabilities = new Set<LimitedCapability>();
  if (full)
    LIMITED_CAPABILITIES.forEach((capability) => capabilities.add(capability));
  if (agent.accountStatus === "pending")
    for (const grant of grants) {
      const expiry = parseDbTime(grant.expiresAt);
      if (
        grant.status === "open" &&
        expiry &&
        expiry.getTime() > now.getTime()
      ) {
        grant.capabilities
          .filter((c) => LIMITED_CAPABILITIES.includes(c))
          .forEach((c) => capabilities.add(c));
      }
    }
  return {
    full,
    admin: full && agent.isAdmin,
    limited: !full && capabilities.size > 0,
    capabilities: [...capabilities],
  };
}
