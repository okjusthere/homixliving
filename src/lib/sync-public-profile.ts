import { sql } from "drizzle-orm";
import { db } from "@/db";
import { publicAgents } from "@/db/schema";

/**
 * Write-through of shared identity fields to the marketing site's roster
 * (public.agents — same Supabase database, owned by homix-website). Called
 * after a portal profile save so the public site shows the same
 * name/phone/license without a second edit.
 *
 * Best-effort by design: never fails the portal save. Local dev databases
 * don't have public.agents at all — that's fine, the catch swallows it.
 * Rows are matched by email; agents not on the public roster are a no-op.
 */
export async function syncPublicAgentProfile(input: {
  email: string;
  name?: string | null;
  phone?: string | null;
  licenseNumber?: string | null;
}): Promise<void> {
  try {
    const updates: Record<string, string> = {};
    if (input.name?.trim()) updates.name = input.name.trim();
    if (input.phone !== undefined) updates.phone = input.phone?.trim() || "";
    if (input.licenseNumber !== undefined) {
      updates.licenseNumber = input.licenseNumber?.trim() || "";
    }
    if (Object.keys(updates).length === 0) return;

    await db
      .update(publicAgents)
      .set(updates)
      .where(sql`lower(${publicAgents.email}) = ${input.email.toLowerCase()}`);
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
  } catch (error) {
    console.warn("homixweb revalidate ping failed:", (error as Error).message);
  }
}
