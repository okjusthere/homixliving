import { NextRequest, NextResponse } from "next/server";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { setAgentPublicVisibility } from "@/lib/homixweb";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  const agentId = auth.session.user.agentId;
  if (!agentId) return NextResponse.json({ error: "No agent record" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const visibilityStatus = String(body.visibilityStatus || "");
  if (visibilityStatus !== "visible" && visibilityStatus !== "agent_hidden") {
    return NextResponse.json({ error: "Invalid visibility status" }, { status: 400 });
  }

  const result = await setAgentPublicVisibility(agentId, visibilityStatus);
  if (result.ok) {
    await logAudit(
      auth.session,
      "update",
      "agent",
      agentId,
      visibilityStatus === "visible" ? "经纪人显示自己的对外主页" : "经纪人隐藏自己的对外主页",
    );
  }
  return NextResponse.json(result.body, { status: result.status });
}
