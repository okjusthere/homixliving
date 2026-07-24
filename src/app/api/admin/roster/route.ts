import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth-guards";
import { homixwebBase, homixwebSecret, isHomixwebConfigured } from "@/lib/homixweb";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only proxy for managing the public advisor roster (www.homixny.com),
// replacing the old website /admin page. Admin-gated by the portal session; the
// website owns public.agents and does the work. GET lists every advisor; POST
// forwards a management action (create | visible | reorder | delete).

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
  create: { action: "create", summary: (b) => `新建对外经纪人（${b.name}）` },
  visible: { action: "update", summary: (b) => `${b.visible ? "上架" : "下架"}对外经纪人（${b.id}）` },
  delete: { action: "delete", summary: (b) => `删除对外经纪人（${b.id}）` },
  reorder: { action: "update", summary: () => `调整对外名册排序` },
};

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  if (!isHomixwebConfigured()) {
    return NextResponse.json({ error: "Website sync is not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  try {
    const res = await fetch(`${homixwebBase()}/api/agent-admin`, {
      method: "POST",
      headers: { authorization: `Bearer ${homixwebSecret()}`, "content-type": "application/json" },
      body: JSON.stringify(body),
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
