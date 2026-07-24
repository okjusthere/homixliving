import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminApi } from "@/lib/auth-guards";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import {
  ensurePublicProfile,
  hidePublicProfileForOffboarding,
  setAdminPublicVisibility,
} from "@/lib/homixweb";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;
  const { id } = await params;
  const parsedId = parseInt(String(id), 10);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "Invalid agent id" }, { status: 400 });
  }
  const [agent] = await db
    .update(agents)
    .set({ accountStatus: "active", updatedAt: new Date().toISOString() })
    .where(eq(agents.id, parsedId))
    .returning();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const publicProfile = await ensurePublicProfile({
    agentId: agent.id,
    name: agent.name,
    phone: agent.phone,
    license: agent.licenseNumber,
  });
  const publicVisibility = publicProfile.ok
    ? await setAdminPublicVisibility({
        agentId: agent.id,
        visibilityStatus: "visible",
      })
    : publicProfile;
  const publicReady = publicProfile.ok && publicVisibility.ok;

  await logAudit(authResult.session, "approve", "agent", parsedId, `批准经纪人 #${parsedId} 账号`);

  // Tell the agent their account is live. No dedupeKey: re-approval after a
  // revoke is a real event and should notify again.
  try {
    await notify({
      recipientAgentIds: [parsedId],
      type: "agent_approved",
      title: "你的 Homix 账号已开通 / Your Homix account is approved",
      body: "现在可以登录使用全部功能了。You now have full access.",
      href: "/",
      email: true,
    });
  } catch (error) {
    console.error("agent_approved notification failed", error);
  }

  return NextResponse.json({
    success: true,
    publicProfileCreated: publicReady,
    ...(!publicReady
      ? {
          warning: String(
            publicVisibility.body.error || "Public profile sync failed",
          ),
        }
      : {}),
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;
  const { id } = await params;
  const parsedId = parseInt(String(id), 10);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "Invalid agent id" }, { status: 400 });
  }
  const hidden = await hidePublicProfileForOffboarding(parsedId);
  if (!hidden.ok) {
    return NextResponse.json(
      {
        error:
          hidden.body.error ||
          "Unable to hide the public profile. The account was not deactivated.",
      },
      { status: 502 },
    );
  }
  await db
    .update(agents)
    .set({ accountStatus: "inactive", updatedAt: new Date().toISOString() })
    .where(eq(agents.id, parsedId));
  await logAudit(authResult.session, "revoke", "agent", parsedId, `撤销经纪人 #${parsedId} 账号权限`);
  return NextResponse.json({ success: true });
}
