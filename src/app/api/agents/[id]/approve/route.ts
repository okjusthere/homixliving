import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminApi } from "@/lib/auth-guards";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import {
  fetchPublicProfile,
  fetchPublicProfileById,
  hidePublicProfileForOffboarding,
  linkPublicProfile,
  publishPublicProfile,
  setAdminPublicVisibility,
  type PublicProfile,
} from "@/lib/homixweb";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;
  const { id } = await params;
  const parsedId = parseInt(String(id), 10);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "Invalid agent id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const publicProfileId =
    typeof body.publicProfileId === "string" ? body.publicProfileId.trim() : "";
  const [existing] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, parsedId))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Roster details are captured here because approval is the one moment an
  // admin is already looking at this person. Collected later they tend never
  // to be filled in at all. All three are optional — approval still works
  // without them.
  const referredByAgentId =
    body.referredByAgentId === undefined || body.referredByAgentId === null || body.referredByAgentId === ""
      ? undefined
      : Number(body.referredByAgentId);
  if (referredByAgentId !== undefined) {
    if (!Number.isInteger(referredByAgentId) || referredByAgentId <= 0) {
      return NextResponse.json({ error: "Invalid referring agent" }, { status: 400 });
    }
    if (referredByAgentId === parsedId) {
      return NextResponse.json({ error: "An agent cannot refer themselves" }, { status: 400 });
    }
    const [referrer] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.id, referredByAgentId))
      .limit(1);
    if (!referrer) {
      return NextResponse.json({ error: "Referring agent not found" }, { status: 404 });
    }
  }

  const teamId =
    body.teamId === undefined || body.teamId === null || body.teamId === ""
      ? undefined
      : Number(body.teamId);
  if (teamId !== undefined) {
    if (!Number.isInteger(teamId) || teamId <= 0) {
      return NextResponse.json({ error: "Invalid team" }, { status: 400 });
    }
    const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const splitPct = body.splitPct === undefined || body.splitPct === null || body.splitPct === ""
    ? undefined
    : Math.round(Number(body.splitPct));
  if (splitPct !== undefined && (!Number.isFinite(splitPct) || splitPct < 0 || splitPct > 100)) {
    return NextResponse.json({ error: "Split must be between 0 and 100" }, { status: 400 });
  }

  let selectedProfile: PublicProfile | null = null;
  if (publicProfileId) {
    const selected = await fetchPublicProfileById(publicProfileId);
    if (selected.unreachable) {
      return NextResponse.json(
        { error: "Unable to verify the selected public profile." },
        { status: 502 },
      );
    }
    if (selected.notFound || !selected.profile) {
      return NextResponse.json(
        { error: "Selected public profile not found." },
        { status: 404 },
      );
    }
    if (
      selected.profile.portal_agent_id != null &&
      selected.profile.portal_agent_id !== parsedId
    ) {
      return NextResponse.json(
        { error: "Selected public profile is already linked." },
        { status: 409 },
      );
    }
    selectedProfile = selected.profile;
  }

  // An existing company profile is better identity evidence than an
  // unreviewed Google display name. Preserve admin-entered phone/license when
  // present, otherwise seed them from the selected public profile.
  const name = selectedProfile?.name?.trim() || existing.name;
  const phone = existing.phone || selectedProfile?.phone || null;
  const licenseNumber =
    existing.licenseNumber || selectedProfile?.license_number || null;
  const [agent] = await db
    .update(agents)
    .set({
      accountStatus: "active",
      name,
      phone,
      licenseNumber,
      // Only overwrite when the admin actually supplied a value, so
      // re-approving someone (e.g. after a revoke) can't silently wipe
      // roster detail set earlier.
      ...(referredByAgentId !== undefined ? { referredByAgentId } : {}),
      ...(teamId !== undefined ? { teamId } : {}),
      ...(splitPct !== undefined ? { splitPct } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(agents.id, parsedId))
    .returning();

  let publicResult = null;
  if (selectedProfile) {
    const linked = await linkPublicProfile({
      publicId: selectedProfile.id,
      agentId: agent.id,
      name: agent.name,
      phone: agent.phone,
      license: agent.licenseNumber,
    });
    if (linked.ok) {
      publicResult = await setAdminPublicVisibility({
        publicId: selectedProfile.id,
        visibilityStatus: "visible",
      });
    } else {
      if (linked.body.linked === true) {
        await setAdminPublicVisibility({
          publicId: selectedProfile.id,
          visibilityStatus: "visible",
        });
      }
      publicResult = linked;
    }
  } else {
    const current = await fetchPublicProfile(agent.id);
    if (current.linked) {
      publicResult = await setAdminPublicVisibility({
        agentId: agent.id,
        visibilityStatus: "visible",
      });
    } else if (current.unreachable) {
      publicResult = {
        ok: false,
        status: 502,
        body: { error: "Website profile could not be checked or published." },
      };
    } else {
      publicResult = await publishPublicProfile({
        agentId: agent.id,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        license: agent.licenseNumber,
      });
    }
  }

  await logAudit(
    authResult.session,
    "approve",
    "agent",
    parsedId,
    publicProfileId
      ? `批准经纪人 #${parsedId} 账号并关联对外档案 ${publicProfileId}`
      : `批准经纪人 #${parsedId} 账号并创建或恢复对外主页`,
  );

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
    publicProfileLinked: publicResult?.ok ?? false,
    ...((publicResult && !publicResult.ok)
      ? {
          warning: String(
            publicResult.body.error || "Public profile sync failed",
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
