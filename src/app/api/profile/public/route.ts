import { NextRequest, NextResponse } from "next/server";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { homixwebBase, homixwebSecret, isHomixwebConfigured } from "@/lib/homixweb";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Portal-side proxy for editing the agent's public marketing-site profile.
// Identity is the portal session: a regular agent edits their OWN linked
// profile; an admin may target another agent via ?agentId=. The portal never
// trusts a client-supplied agent id — it derives it from the session (or, for
// admins, validates the override server-side). The website owns public.agents
// and does all the real work; here we just forward with the shared secret.

/** Resolve which portal agent id this request may act on. */
function resolveTargetAgentId(
  session: { user: { agentId: number | null; isAdmin: boolean } },
  requested: string | null,
): { agentId: number } | { error: NextResponse } {
  if (requested) {
    const id = Number(requested);
    if (!Number.isInteger(id) || id <= 0) {
      return { error: NextResponse.json({ error: "Invalid agentId" }, { status: 400 }) };
    }
    // Only admins may edit someone else's profile.
    if (!session.user.isAdmin && session.user.agentId !== id) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { agentId: id };
  }
  if (!session.user.agentId) {
    return { error: NextResponse.json({ error: "No agent record" }, { status: 400 }) };
  }
  return { agentId: session.user.agentId };
}

export async function GET(req: NextRequest) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  if (!isHomixwebConfigured()) {
    return NextResponse.json({ error: "Website sync is not configured." }, { status: 503 });
  }

  const target = resolveTargetAgentId(auth.session, req.nextUrl.searchParams.get("agentId"));
  if ("error" in target) return target.error;

  try {
    const res = await fetch(
      `${homixwebBase()}/api/agent-profile?portalAgentId=${target.agentId}`,
      {
        headers: { authorization: `Bearer ${homixwebSecret()}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (res.status === 404) return NextResponse.json({ linked: false });
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the website." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  if (!isHomixwebConfigured()) {
    return NextResponse.json({ error: "Website sync is not configured." }, { status: 503 });
  }

  let inForm: FormData;
  try {
    inForm = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected form data" }, { status: 400 });
  }
  const target = resolveTargetAgentId(auth.session, (inForm.get("agentId") as string) || null);
  if ("error" in target) return target.error;

  // Rebuild the forwarded form: inject the server-resolved portalAgentId, drop
  // the client's agentId hint (never forwarded as identity).
  const out = new FormData();
  for (const [key, value] of inForm.entries()) {
    if (key === "agentId") continue;
    out.append(key, value);
  }
  out.set("portalAgentId", String(target.agentId));

  try {
    const res = await fetch(`${homixwebBase()}/api/agent-profile`, {
      method: "POST",
      headers: { authorization: `Bearer ${homixwebSecret()}` },
      body: out,
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.ok) {
      await logAudit(
        auth.session,
        "update",
        "agent",
        target.agentId,
        `更新对外主页（www.homixny.com）${target.agentId !== auth.session.user.agentId ? "（管理员代改）" : ""}`,
      );
    }
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the website." }, { status: 502 });
  }
}
