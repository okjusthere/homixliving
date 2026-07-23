import { eq } from "drizzle-orm";
import { db } from "@/db";
import { publicAgents } from "@/db/schema";

/**
 * Write-through of shared identity fields to the marketing site's roster
 * (public.agents — same Supabase database, owned by homix-website). Called
 * after a portal profile save so the public site shows the same
 * name/phone/license without a second edit.
 *
 * Matching is by the EXPLICIT link column public.agents.portal_agent_id
 * only — the rosters are not 1:1 and public contact emails frequently
 * differ from portal login emails (personal Gmail, or empty), so fuzzy
 * matching here would sync the wrong person's profile. Links are
 * established once via scripts/link-agent-rosters.ts; unlinked agents are
 * skipped and logged.
 *
 * Best-effort by design: never fails the portal save. Local dev databases
 * don't have public.agents at all — the catch swallows that.
 */
export async function syncPublicAgentProfile(input: {
  agentId: number;
  name?: string | null;
  phone?: string | null;
  licenseNumber?: string | null;
}): Promise<void> {
  let linkedSlug: string | null = null;
  try {
    const updates: Record<string, string> = {};
    if (input.name?.trim()) updates.name = input.name.trim();
    if (input.phone !== undefined) updates.phone = input.phone?.trim() || "";
    if (input.licenseNumber !== undefined) {
      updates.licenseNumber = input.licenseNumber?.trim() || "";
    }
    if (Object.keys(updates).length === 0) return;

    const updated = await db
      .update(publicAgents)
      .set(updates)
      .where(eq(publicAgents.portalAgentId, input.agentId))
      .returning({ slug: publicAgents.slug });

    if (updated.length === 0) {
      console.log(
        `public.agents write-through: portal agent #${input.agentId} has no linked public profile (run scripts/link-agent-rosters.ts)`,
      );
      return;
    }
    linkedSlug = updated[0].slug;
  } catch (error) {
    console.warn("public.agents write-through skipped:", (error as Error).message);
    return;
  }

  // Nudge the website to drop its cached roster (24h TTL otherwise).
  const url = process.env.HOMIXWEB_REVALIDATE_URL?.trim();
  const secret = process.env.AGENTS_REVALIDATE_SECRET?.trim();
  if (!url || !secret) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(4000),
    });
    console.log(`public profile synced (slug ${linkedSlug}) + website cache refreshed`);
  } catch (error) {
    console.warn("homixweb revalidate ping failed:", (error as Error).message);
  }
}
