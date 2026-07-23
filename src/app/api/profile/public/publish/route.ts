import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { homixwebBase, homixwebSecret, isHomixwebConfigured } from "@/lib/homixweb";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publish a public marketing-site profile for a portal agent who has none yet.
// A regular agent may publish THEMSELVES; an admin may publish anyone. The new
// profile starts hidden (the website sets visible:false) so it can be reviewed
// before it goes live. The website creates + links the row; we just supply the
// agent's identity fields from the portal record.
export async function POST(req: NextRequest) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  if (!isHomixwebConfigured()) {
    return NextResponse.json({ error: "Website sync is not configured." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  let agentId = auth.session.user.agentId ?? 0;
  if (body.agentId != null) {
    const requested = Number(body.agentId);
    if (!Number.isInteger(requested) || requested <= 0) {
      return NextResponse.json({ error: "Invalid agentId" }, { status: 400 });
    }
    if (!auth.session.user.isAdmin && auth.session.user.agentId !== requested) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    agentId = requested;
  }
  if (!agentId) return NextResponse.json({ error: "No agent record" }, { status: 400 });

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  try {
    const res = await fetch(`${homixwebBase()}/api/agent-profile/publish`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${homixwebSecret()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        portalAgentId: agentId,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        license: agent.licenseNumber,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const out = await res.json().catch(() => ({}));
    if (res.ok && out?.published && !out?.alreadyLinked) {
      await logAudit(
        auth.session,
        "create",
        "agent",
        agentId,
        `发布对外主页到 www.homixny.com（${agent.name}，默认隐藏待审）`,
      );
    }
    return NextResponse.json(out, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the website." }, { status: 502 });
  }
}
