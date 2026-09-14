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

/**
 * Best-effort work that follows the atomic account activation. A website or
 * email outage must not turn a verified Stripe payment into a failed webhook.
 */
export async function finalizeAutomaticOnboardingActivation(input: {
  agentId: number;
  orderId: number;
}) {
  try {
    const [agent] = await db.select().from(agents).where(eq(agents.id, input.agentId)).limit(1);
    if (!agent || agent.accountStatus !== "active") return;

    let publicProfileReady = false;
    const current = await fetchPublicProfile(agent.id);
    if (current.linked) {
      const visible = await setAdminPublicVisibility({
        agentId: agent.id,
        visibilityStatus: "visible",
      });
      publicProfileReady = visible.ok;
    } else if (!current.unreachable) {
      const published = await publishPublicProfile({
        agentId: agent.id,
        name: agent.name,
        legalName: agent.legalName,
        email: agent.email,
        phone: agent.phone,
        license: agent.licenseNumber,
      });
      publicProfileReady = published.ok;
    }

    if (publicProfileReady) {
      await syncPublicAgentProfile({
        agentId: agent.id,
        name: agent.name,
        legalName: agent.legalName,
        phone: agent.phone,
        licenseNumber: agent.licenseNumber,
      });
    }

    await logAudit(
      SYSTEM_ACTOR,
      "auto_activate",
      "agent",
      agent.id,
      `Stripe 线上入职付款后自动开通经纪人 #${agent.id}`,
      { orderId: input.orderId, publicProfileReady },
    );
    await notify({
      recipientAgentIds: [agent.id],
      type: "agent_approved",
      title: "你的 Homix 账号已开通 / Your Homix account is active",
      body: "线上签约和付款已完成，现在可以进入 Homix Agents。Your online onboarding is complete.",
      href: "/",
      dedupeKey: `online-onboarding-activated:${input.orderId}`,
      email: true,
    });
  } catch (error) {
    console.error("Automatic onboarding follow-up failed", {
      agentId: input.agentId,
      orderId: input.orderId,
      error,
    });
  }
}
