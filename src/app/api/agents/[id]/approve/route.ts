import { verifiedManualContract } from "@/lib/onboarding-requirements";
import { onboardingAccessGrants } from "@/db/onboarding-schema";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, commerceOrders, teamJoinRequests, teams } from "@/db/schema";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { lockAgentLedgers, lockOnboardingAgent } from "@/lib/advisory-locks";
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
import { normalizeAgentPlan, PLAN_SPLIT_PCT } from "@/lib/agent-plans";
import {
  onboardingAgreementAllowsPayment,
  onboardingPaymentProduct,
} from "@/lib/onboarding";
import { syncOnboardingAgreement } from "@/lib/onboarding-agreement";
import { syncPublicAgentProfile } from "@/lib/sync-public-profile";
import { fullyWaivedOnboarding } from "@/lib/onboarding-fees";
import { onboardingCheckoutBlockReason, OnboardingStripeConflict, verifyOnboardingCheckoutsClosed } from "@/lib/onboarding-stripe-guard";
import { getStripe } from "@/lib/stripe";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const { id } = await params;
  const parsedId = Number(id);
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(parsedId) || parsedId <= 0) {
    return NextResponse.json({ error: "Invalid agent id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const publicProfileId =
    typeof body.publicProfileId === "string" ? body.publicProfileId.trim() : "";
  let [existing] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, parsedId))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  if (existing.accountStatus === "active")
    return NextResponse.json({ success: true, replayed: true });
  if (existing.accountStatus === "inactive") return NextResponse.json({ error: "Restore the account to onboarding and review the current contract and billing basis before activating." }, { status: 409 });
  const [pendingTeamJoinRequest] = await db
    .select({ id: teamJoinRequests.id })
    .from(teamJoinRequests)
    .where(
      and(
        eq(teamJoinRequests.agentId, existing.id),
        eq(teamJoinRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (pendingTeamJoinRequest) {
    return NextResponse.json(
      {
        error:
          "The Team Leader must decide the pending team application before approval.",
      },
      { status: 409 },
    );
  }
  if (existing.accountStatus === "pending") {
    // Fresh provider proof only; never expire a live checkout, cancel a subscription or refund here.
    // The locked guard below rechecks for a reservation created after this preflight.
    try {
      await verifyOnboardingCheckoutsClosed(parsedId, sessionId =>
        getStripe().checkout.sessions.retrieve(sessionId, {}, { timeout: 5000, maxNetworkRetries: 0 }));
    } catch (error) {
      if (error instanceof OnboardingStripeConflict)
        return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }
    if (existing.signingRequestId && !verifiedManualContract(existing)) {
      try {
        existing = await syncOnboardingAgreement(existing);
      } catch (error) {
        console.error(
          "Unable to verify onboarding agreement before approval",
          error,
        );
        return NextResponse.json(
          { error: "Unable to verify the latest eSign status. Please retry." },
          { status: 502 },
        );
      }
    }
    const paymentRequired = onboardingPaymentProduct(
      normalizeAgentPlan(existing.plan),
      existing.affiliationTermMonths,
    );
    if (!existing.onboardingCompletedAt) {
      return NextResponse.json(
        { error: "The agent has not completed their onboarding profile." },
        { status: 409 },
      );
    }
    if (!onboardingAgreementAllowsPayment(existing)) {
      return NextResponse.json(
        { error: "The agent has not signed the affiliation agreement." },
        { status: 409 },
      );
    }
    if (
      normalizeAgentPlan(existing.plan) === "team_member" &&
      (!existing.teamTermsConfigId || !existing.teamTermsAcceptedAt)
    ) {
      return NextResponse.json(
        {
          error:
            "The agent has not accepted the selected team compensation terms.",
        },
        { status: 409 },
      );
    }
    if (paymentRequired && existing.paymentStatus !== "paid" && !fullyWaivedOnboarding(existing)) {
      return NextResponse.json(
        { error: "The required affiliation fee has not been paid." },
        { status: 409 },
      );
    }
    const [settledOnboardingOrder] = await db
      .select({ paymentChannel: commerceOrders.paymentChannel })
      .from(commerceOrders)
      .where(
        and(
          eq(commerceOrders.agentId, existing.id),
          gt(commerceOrders.licenseTransferFeeCents, 0),
          inArray(commerceOrders.status, ["paid", "active"]),
        ),
      )
      .orderBy(desc(commerceOrders.paidAt), desc(commerceOrders.id))
      .limit(1);
    if (!settledOnboardingOrder && !fullyWaivedOnboarding(existing)) {
      return NextResponse.json(
        {
          error:
            "A verified offline onboarding payment is required before admin approval.",
        },
        { status: 409 },
      );
    }
    if (settledOnboardingOrder && settledOnboardingOrder.paymentChannel !== "offline") {
      return NextResponse.json(
        {
          error:
            "Stripe onboarding payments activate automatically. Refresh the agent list.",
        },
        { status: 409 },
      );
    }
  }

  const agreementFactsFrozen =
    existing.accountStatus === "pending" &&
    existing.agreementStatus !== "not_started";

  // Roster details are captured here because approval is the one moment an
  // admin is already looking at this person. Collected later they tend never
  // to be filled in at all. All three are optional — approval still works
  // without them.
  const referredByAgentId =
    body.referredByAgentId === undefined ||
    body.referredByAgentId === null ||
    body.referredByAgentId === ""
      ? undefined
      : Number(body.referredByAgentId);
  if (referredByAgentId !== undefined) {
    if (!Number.isInteger(referredByAgentId) || referredByAgentId <= 0) {
      return NextResponse.json(
        { error: "Invalid referring agent" },
        { status: 400 },
      );
    }
    if (referredByAgentId === parsedId) {
      return NextResponse.json(
        { error: "An agent cannot refer themselves" },
        { status: 400 },
      );
    }
    const [referrer] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.id, referredByAgentId))
      .limit(1);
    if (!referrer) {
      return NextResponse.json(
        { error: "Referring agent not found" },
        { status: 404 },
      );
    }
    if (
      agreementFactsFrozen &&
      referredByAgentId !== existing.referredByAgentId
    ) {
      return NextResponse.json(
        {
          error:
            "Sponsor cannot change after the affiliation agreement is sent.",
        },
        { status: 409 },
      );
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
    const [team] = await db
      .select({ id: teams.id, companyId: teams.companyId })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    if (!team)
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    if (
      !existing.licensedCompanyId ||
      team.companyId !== existing.licensedCompanyId
    ) {
      return NextResponse.json(
        { error: "Agent and team must belong to the same licensed company." },
        { status: 409 },
      );
    }
    if (agreementFactsFrozen && teamId !== existing.teamId) {
      return NextResponse.json(
        {
          error: "Team cannot change after the affiliation agreement is sent.",
        },
        { status: 409 },
      );
    }
  }

  const effectiveTeamId = teamId !== undefined ? teamId : existing.teamId;
  if (effectiveTeamId) {
    const [effectiveTeam] = await db
      .select({ companyId: teams.companyId })
      .from(teams)
      .where(eq(teams.id, effectiveTeamId))
      .limit(1);
    if (!effectiveTeam) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }
    if (
      !existing.licensedCompanyId ||
      effectiveTeam.companyId !== existing.licensedCompanyId
    ) {
      return NextResponse.json(
        { error: "Agent and team must belong to the same licensed company." },
        { status: 409 },
      );
    }
  }
  const isTeamLeader = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.leaderAgentId, parsedId))
    .limit(1)
    .then((rows) => rows.length > 0);
  const effectivePlan = isTeamLeader
    ? "solo_pro"
    : normalizeAgentPlan(existing.plan);
  if (effectivePlan === "team_member" && !effectiveTeamId) {
    return NextResponse.json(
      { error: "Team Member onboarding must select a team before approval." },
      { status: 400 },
    );
  }
  const now = new Date().toISOString();
  const anniversaryStart =
    existing.accountStatus === "pending"
      ? existing.affiliationPaidAt || now.slice(0, 10)
      : existing.anniversaryStart || existing.joinedAt || now.slice(0, 10);

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

  // Preserve admin-entered phone/license when present, otherwise seed them
  // from the explicitly selected public profile.
  // Linking a website record must not replace the agent's Preferred name
  // with a legacy/combined website title.
  const name = existing.name;
  const phone = existing.phone || selectedProfile?.phone || null;
  const licenseNumber =
    existing.licenseNumber || selectedProfile?.license_number || null;
  let checkoutBlock: string | null = null;
  const agent = await db.transaction(async (tx) => {
    await lockAgentLedgers(tx, [parsedId]);
    await lockOnboardingAgent(tx, parsedId);
    const [fresh] = await tx
      .select()
      .from(agents)
      .where(eq(agents.id, parsedId))
      .limit(1);
    if (
      !fresh ||
      fresh.updatedAt !== existing.updatedAt ||
      fresh.accountStatus !== existing.accountStatus
    )
      return null;
    if (existing.accountStatus === "pending") {
      checkoutBlock = await onboardingCheckoutBlockReason(tx, parsedId);
      if (checkoutBlock) return null;
      const [payment] = await tx
        .select({ id: commerceOrders.id })
        .from(commerceOrders)
        .where(
          and(
            eq(commerceOrders.agentId, parsedId),
            eq(commerceOrders.paymentChannel, "offline"),
            gt(commerceOrders.licenseTransferFeeCents, 0),
            inArray(commerceOrders.status, ["paid", "active"]),
          ),
        )
        .limit(1);
      const [pendingTeam] = await tx
        .select({ id: teamJoinRequests.id })
        .from(teamJoinRequests)
        .where(
          and(
            eq(teamJoinRequests.agentId, parsedId),
            eq(teamJoinRequests.status, "pending"),
          ),
        )
        .limit(1);
      if (
        (!payment && !fullyWaivedOnboarding(fresh)) ||
        pendingTeam ||
        !onboardingAgreementAllowsPayment(fresh) ||
        (fresh.paymentStatus !== "paid" && !fullyWaivedOnboarding(fresh))
      )
        return null;
    }
    const [activated] = await tx
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
        plan: effectivePlan,
        splitPct: PLAN_SPLIT_PCT[effectivePlan],
        planEffectiveFrom:
          existing.accountStatus === "pending"
            ? now.slice(0, 10)
            : existing.planEffectiveFrom || now.slice(0, 10),
        anniversaryStart,
        teamTermsEffectiveFrom:
          effectivePlan === "team_member" ? anniversaryStart : null,
        teamTermsConfigId:
          effectivePlan === "team_member" ? existing.teamTermsConfigId : null,
        teamTermsAcceptedAt:
          effectivePlan === "team_member" ? existing.teamTermsAcceptedAt : null,
        onboardingCompletedAt: existing.onboardingCompletedAt || now,
        onboardingStage: "complete",
        updatedAt: now,
      })
      .where(
        and(
          eq(agents.id, parsedId),
          sql`${agents.updatedAt} IS NOT DISTINCT FROM ${existing.updatedAt}::timestamptz`,
        ),
      )
      .returning();
    if (activated) await tx.update(onboardingAccessGrants).set({ status: "completed", endedBy: authResult.session.user.agentId, endedAt: now }).where(and(eq(onboardingAccessGrants.agentId, parsedId), eq(onboardingAccessGrants.status, "open")));
    return activated || null;
  });
  if (!agent)
    return NextResponse.json(
      {
        error: checkoutBlock ||
          "Onboarding changed while approving. Refresh and review the latest status.",
      },
      { status: 409 },
    );

  let publicResult = null;
  if (selectedProfile) {
    const linked = await linkPublicProfile({
      publicId: selectedProfile.id,
      agentId: agent.id,
      name: agent.name,
      legalName: agent.legalName,
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
        legalName: agent.legalName,
        email: agent.email,
        phone: agent.phone,
        license: agent.licenseNumber,
      });
    }
  }

  const mlsVerification = publicResult?.ok
    ? await syncPublicAgentProfile({
        agentId: agent.id,
        name: agent.name,
        legalName: agent.legalName,
        phone: agent.phone,
        licenseNumber: agent.licenseNumber,
      })
    : { status: "failed" as const };

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
    mlsVerification,
    ...(publicResult && !publicResult.ok
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
  { params }: { params: Promise<{ id: string }> },
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
  await logAudit(
    authResult.session,
    "revoke",
    "agent",
    parsedId,
    `撤销经纪人 #${parsedId} 账号权限`,
  );
  return NextResponse.json({ success: true });
}
