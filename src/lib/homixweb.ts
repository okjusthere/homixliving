/**
 * Server-to-server calls to the marketing site (www.homixny.com), which owns
 * public.agents. The portal never writes public.agents directly for profile
 * edits — it forwards to the website's /api/agent-profile* endpoints so all
 * profile logic (validation, MLS verification, photo upload, cache
 * revalidation) stays in one place. Auth is the shared secret; identity
 * (which agent) is always the portal's own session, never a client value.
 */

/** Base origin of the marketing site, derived from the revalidate-hook URL. */
export function homixwebBase(): string {
  const hook = process.env.HOMIXWEB_REVALIDATE_URL?.trim();
  if (hook) {
    try {
      return new URL(hook).origin;
    } catch {
      /* fall through */
    }
  }
  return "https://www.homixny.com";
}

export function homixwebSecret(): string {
  return process.env.AGENTS_REVALIDATE_SECRET?.trim() || "";
}

export function isHomixwebConfigured(): boolean {
  return Boolean(homixwebSecret());
}

export type PublicProfile = {
  id: string;
  slug: string;
  name: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  bio: string | null;
  license_number: string | null;
  specialties: string[] | null;
  languages: string[] | null;
  social: Record<string, string> | null;
  wechat_qr: string | null;
  reviews: Record<string, { url: string; rating?: string; count?: string }> | null;
  stats: Record<string, string> | null;
  testimonials: { quote: string; author?: string }[] | null;
  photo_url: string | null;
  show_past_deals: boolean | null;
  visible: boolean | null;
  mls_id: string | null;
};

/** Server-side fetch of a portal agent's linked public profile (or null). */
export async function fetchPublicProfile(
  portalAgentId: number,
): Promise<{ linked: boolean; profile?: PublicProfile; unreachable?: boolean }> {
  if (!isHomixwebConfigured()) return { linked: false, unreachable: true };
  try {
    const res = await fetch(
      `${homixwebBase()}/api/agent-profile?portalAgentId=${portalAgentId}`,
      {
        headers: { authorization: `Bearer ${homixwebSecret()}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (res.status === 404) return { linked: false };
    if (!res.ok) return { linked: false, unreachable: true };
    const body = (await res.json()) as { linked: boolean; profile?: PublicProfile };
    return { linked: !!body.linked, profile: body.profile };
  } catch {
    return { linked: false, unreachable: true };
  }
}
