import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth-guards";
import { homixwebBase, homixwebSecret, isHomixwebConfigured } from "@/lib/homixweb";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only proxy to edit ANY advisor's public profile by public agent id —
// covers advisors with no portal account. Forwards the multipart form to the
// website's /api/agent-admin/edit (shared save core). Admin-gated by the session.
export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
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
  const id = String(inForm.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const res = await fetch(`${homixwebBase()}/api/agent-admin/edit`, {
      method: "POST",
      headers: { authorization: `Bearer ${homixwebSecret()}` },
      body: inForm,
      signal: AbortSignal.timeout(20000),
    });
    const out = await res.json().catch(() => ({}));
    if (res.ok && out?.ok) {
      await logAudit(auth.session, "update", "agent", id, `编辑对外经纪人主页（${id}，管理员）`);
    }
    return NextResponse.json(out, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the website." }, { status: 502 });
  }
}
