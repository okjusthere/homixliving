import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminApi } from "@/lib/auth-guards";
import { homixwebBase, homixwebSecret, isHomixwebConfigured } from "@/lib/homixweb";
import { logAudit } from "@/lib/audit";
import { db } from "@/db";
import { agents } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only proxy for managing the public advisor roster (www.homixny.com),
// replacing the old website /admin page. Admin-gated by the portal session; the
// website owns public.agents and does the work. Account creation/deactivation
// stays in /agents; this route controls visibility, ordering, and explicit
// public-profile links.

export async function GET() {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  if (!isHomixwebConfigured()) {
    return NextResponse.json({ error: "Website sync is not configured." }, { status: 503 });
  }
  try {
    const res = await fetch(`${homixwebBase()}/api/agent-admin`, {
      headers: { authorization: `Bearer ${homixwebSecret()}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the website." }, { status: 502 });
  }
}

const AUDIT: Record<string, { action: string; summary: (b: Record<string, unknown>) => string }> = {
  visibility: {
    action: "update",
    summary: (b) =>
      `${b.visibilityStatus === "visible" ? "显示" : "管理员隐藏"}对外经纪人（${b.id}）`,
  },
  reorder: { action: "update", summary: () => `调整对外名册排序` },
  link: {
    action: "update",
    summary: (b) => `关联对外档案（${b.id}）到经纪人 #${b.portalAgentId}`,
  },
};

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  if (!isHomixwebConfigured()) {
    return NextResponse.json({ error: "Website sync is not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  let outboundBody = body;
  if (action === "link") {
    const publicId = String(body.id || "").trim();
    const portalAgentId = Number(body.portalAgentId);
    if (!publicId || !Number.isInteger(portalAgentId) || portalAgentId <= 0) {
      return NextResponse.json(
        { error: "id and portalAgentId required" },
        { status: 400 },
      );
    }
    const [agent] = await db
      .select({
        id: agents.id,
        name: agents.name,
        phone: agents.phone,
        licenseNumber: agents.licenseNumber,
        accountStatus: agents.accountStatus,
      })
      .from(agents)
      .where(eq(agents.id, portalAgentId))
      .limit(1);
    if (!agent || agent.accountStatus !== "active") {
      return NextResponse.json(
        { error: "Active portal agent not found." },
        { status: 404 },
      );
    }
    outboundBody = {
      action,
      id: publicId,
      portalAgentId: agent.id,
      name: agent.name,
      phone: agent.phone,
      license: agent.licenseNumber,
    };
  }
  try {
    const res = await fetch(`${homixwebBase()}/api/agent-admin`, {
      method: "POST",
      headers: { authorization: `Bearer ${homixwebSecret()}`, "content-type": "application/json" },
      body: JSON.stringify(outboundBody),
      signal: AbortSignal.timeout(12000),
    });
    const out = await res.json().catch(() => ({}));
    if (res.ok && out?.ok && AUDIT[action]) {
      const entityId = String(out.id ?? body.id ?? "");
      await logAudit(auth.session, AUDIT[action].action, "agent", entityId || null, AUDIT[action].summary(body));
    }
    return NextResponse.json(out, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the website." }, { status: 502 });
  }
}
