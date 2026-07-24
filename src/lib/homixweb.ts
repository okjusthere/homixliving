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
  visibility_status: PublicProfileVisibility | null;
  mls_id: string | null;
};

export type PublicProfileVisibility = "visible" | "agent_hidden" | "admin_hidden";

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

/** One row of the admin public-roster console (keyed by public agent id). */
export type AdminAgentRow = {
  id: string;
  name: string | null;
  slug: string;
  visibility_status: PublicProfileVisibility | null;
  sort: number | null;
  portal_agent_id: number | null;
  photo_url: string | null;
  license_number: string | null;
};

async function postHomixwebJson(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 10000,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  if (!isHomixwebConfigured()) {
    return { ok: false, status: 503, body: { error: "Website sync is not configured." } };
  }
  try {
    const res = await fetch(`${homixwebBase()}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${homixwebSecret()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      ok: res.ok,
      status: res.status,
      body: (await res.json().catch(() => ({}))) as Record<string, unknown>,
    };
  } catch {
    return { ok: false, status: 502, body: { error: "Couldn't reach the website." } };
  }
}

/** Idempotently create the minimal, initially visible public profile. */
export async function ensurePublicProfile(input: {
  agentId: number;
  name: string;
  phone?: string | null;
  license?: string | null;
}) {
  return postHomixwebJson("/api/agent-profile/publish", {
    portalAgentId: input.agentId,
    name: input.name,
    phone: input.phone,
    license: input.license,
  });
}

/** Sync portal-owned identity fields; public profile forms cannot change them. */
export async function syncPublicIdentity(input: {
  agentId: number;
  name: string;
  phone?: string | null;
  license?: string | null;
}) {
  return postHomixwebJson("/api/agent-profile/identity", {
    portalAgentId: input.agentId,
    name: input.name,
    phone: input.phone,
    license: input.license,
  });
}

/** Agent-controlled visibility. Website refuses to override admin_hidden. */
export async function setAgentPublicVisibility(
  agentId: number,
  visibilityStatus: Extract<PublicProfileVisibility, "visible" | "agent_hidden">,
) {
  return postHomixwebJson("/api/agent-profile/visibility", {
    portalAgentId: agentId,
    visibilityStatus,
  });
}

/** Administrator visibility override, including offboarding. */
export async function setAdminPublicVisibility(input: {
  agentId?: number;
  publicId?: string;
  visibilityStatus: Extract<PublicProfileVisibility, "visible" | "admin_hidden">;
}) {
  return postHomixwebJson("/api/agent-admin", {
    action: "visibility",
    portalAgentId: input.agentId,
    id: input.publicId,
    visibilityStatus: input.visibilityStatus,
  });
}

/**
 * Hide a profile before deactivating its portal account. A missing public
 * profile is already safe; any other website failure blocks offboarding so an
 * admin never receives a false success while the advisor remains public.
 */
export async function hidePublicProfileForOffboarding(agentId: number) {
  const result = await setAdminPublicVisibility({
    agentId,
    visibilityStatus: "admin_hidden",
  });
  if (result.status === 404) {
    return { ok: true, status: 200, body: { notLinked: true } };
  }
  return result;
}

/** Server-side fetch of the full public roster for the admin console. */
export async function fetchAllPublicAgents(): Promise<{
  agents: AdminAgentRow[];
  unreachable?: boolean;
}> {
  if (!isHomixwebConfigured()) return { agents: [], unreachable: true };
  try {
    const res = await fetch(`${homixwebBase()}/api/agent-admin`, {
      headers: { authorization: `Bearer ${homixwebSecret()}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { agents: [], unreachable: true };
    const body = (await res.json()) as { agents: AdminAgentRow[] };
    return { agents: body.agents ?? [] };
  } catch {
    return { agents: [], unreachable: true };
  }
}

/** Server-side fetch of ANY advisor's editable profile by public agent id. */
export async function fetchPublicProfileById(
  id: string,
): Promise<{ profile?: PublicProfile; unreachable?: boolean; notFound?: boolean }> {
  if (!isHomixwebConfigured()) return { unreachable: true };
  try {
    const res = await fetch(
      `${homixwebBase()}/api/agent-admin/edit?id=${encodeURIComponent(id)}`,
      {
        headers: { authorization: `Bearer ${homixwebSecret()}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (res.status === 404) return { notFound: true };
    if (!res.ok) return { unreachable: true };
    const body = (await res.json()) as { profile: PublicProfile };
    return { profile: body.profile };
  } catch {
    return { unreachable: true };
  }
}
