import { syncPublicIdentity } from "@/lib/homixweb";

/**
 * Sync portal-owned identity fields through the marketing site's API. The
 * portal no longer writes public.agents directly; homix-website remains the
 * sole writer and performs MLS verification plus cache invalidation.
 *
 * Matching is by the EXPLICIT link column public.agents.portal_agent_id
 * only — the rosters are not 1:1 and public contact emails frequently
 * differ from portal login emails (personal Gmail, or empty), so fuzzy
 * matching here would sync the wrong person's profile. Links are
 * established once via scripts/link-agent-rosters.ts; unlinked agents are
 * skipped and logged.
 *
 * Best-effort by design: a temporary website outage must not roll back the
 * canonical portal save. The next identity edit retries the sync.
 */
export async function syncPublicAgentProfile(input: {
  agentId: number;
  name?: string | null;
  phone?: string | null;
  licenseNumber?: string | null;
}): Promise<void> {
  try {
    const result = await syncPublicIdentity({
      agentId: input.agentId,
      name: input.name?.trim() || "",
      phone: input.phone,
      license: input.licenseNumber,
    });
    if (!result.ok && result.status !== 404) {
      console.warn(
        `public identity sync failed for portal agent #${input.agentId}:`,
        result.body.error || `HTTP ${result.status}`,
      );
    }
  } catch (error) {
    console.warn("public identity sync skipped:", (error as Error).message);
  }
}
