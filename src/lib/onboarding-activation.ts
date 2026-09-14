import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import {
  fetchPublicProfile,
  publishPublicProfile,
  setAdminPublicVisibility,
} from "@/lib/homixweb";
import { notify } from "@/lib/notify";
import { syncPublicAgentProfile } from "@/lib/sync-public-profile";

const SYSTEM_ACTOR = { user: { email: "stripe@system.homixny.com" } };

/** Retryable post-activation work; an outage remains an administrator task. */
export async function retryOnboardingWebsiteSync(agentId: number) {
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent || agent.accountStatus !== "active") return { publicProfileReady: false };
  // Replayed payment/approval callbacks must not undo a later manual hide.
  if (agent.onboardingWebsiteSync?.status === "complete") return { publicProfileReady: true };
  const attemptedAt = new Date().toISOString();
  await db.update(agents).set({ onboardingWebsiteSync: { status: "pending", attemptedAt } }).where(eq(agents.id, agentId));
  let publicProfileReady = false;
  try {
    const current = await fetchPublicProfile(agent.id);
    if (current.linked) {
      const visible = await setAdminPublicVisibility({ agentId: agent.id, visibilityStatus: "visible" });
      publicProfileReady = visible.ok;
    } else if (!current.unreachable) {
      const published = await publishPublicProfile({ agentId: agent.id, name: agent.name,
        legalName: agent.legalName, email: agent.email, phone: agent.phone, license: agent.licenseNumber });
      publicProfileReady = published.ok;
    }
    if (publicProfileReady) {
      const identity = await syncPublicAgentProfile({ agentId: agent.id, name: agent.name,
        legalName: agent.legalName, phone: agent.phone, licenseNumber: agent.licenseNumber });
      publicProfileReady = identity.status !== "failed" && identity.status !== "unlinked";
    }
    if (publicProfileReady)
      await db.update(agents).set({ onboardingWebsiteSync: { status: "complete", attemptedAt } }).where(eq(agents.id, agentId));
  } catch {
    console.error("Onboarding website sync remains pending", { agentId });
  }
  return { publicProfileReady };
}

/**
 * Best-effort work that follows the atomic account activation. A website or
 * email outage must not turn a verified Stripe payment into a failed webhook.
 */
export async function finalizeAutomaticOnboardingActivation(input: {
  agentId: number;
  orderId: number | null;
  manualApprovalKey?: string;
  actorEmail?: string;
}) {
  let publicProfileReady = false;
  try {
    const [agent] = await db.select().from(agents).where(eq(agents.id, input.agentId)).limit(1);
    if (!agent || agent.accountStatus !== "active") return { publicProfileReady };
    ({ publicProfileReady } = await retryOnboardingWebsiteSync(agent.id));

    await logAudit(
      input.manualApprovalKey ? { user: { email: input.actorEmail || "admin@system.homixny.com" } } : SYSTEM_ACTOR,
      input.manualApprovalKey ? "approve" : "auto_activate",
      "agent",
      agent.id,
      input.manualApprovalKey ? `管理员核验费用依据后开通经纪人 #${agent.id}` : `Stripe 线上入职付款后自动开通经纪人 #${agent.id}`,
      { orderId: input.orderId, publicProfileReady },
    );
    await notify({
      recipientAgentIds: [agent.id],
      type: "agent_approved",
      title: "你的 Homix 账号已开通 / Your Homix account is active",
      body: input.manualApprovalKey ? "入职审批已完成，现在可以进入 Homix Agents。Your onboarding has been approved." : "线上签约和付款已完成，现在可以进入 Homix Agents。Your online onboarding is complete.",
      href: "/",
      dedupeKey: input.manualApprovalKey ? `admin-onboarding-activated:${agent.id}:${input.manualApprovalKey}` : `online-onboarding-activated:${input.orderId}`,
      email: true,
    });
  } catch (error) {
    console.error("Automatic onboarding follow-up failed", {
      agentId: input.agentId,
      orderId: input.orderId,
      error,
    });
  }
  return { publicProfileReady };
}
