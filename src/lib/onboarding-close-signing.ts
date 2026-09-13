import "server-only";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, onboardingEvents } from "@/db/schema";
import { lockOnboardingAgent } from "@/lib/advisory-locks";
import {
  signingActor,
  signingBridgeJson,
  SigningBridgeError,
} from "@/lib/signing-bridge";
import { signingRequestSchema } from "@/lib/signing-contract";
import { syncOnboardingAgreement } from "@/lib/onboarding-agreement";
import { onboardingEventValues } from "@/lib/onboarding-events";
export async function closeOnboardingSigning(
  agentId: number,
  actorId: number,
  rawReason: unknown,
) {
  const reason = z.string().trim().min(5).max(2000).parse(rawReason),
    actor = await signingActor();
  if (!actor.admin || actor.agentId !== actorId)
    throw new SigningBridgeError("ADMIN_REQUIRED", 403);
  const agent = await db.transaction(async (tx) => {
    await lockOnboardingAgent(tx, agentId);
    const [current] = await tx
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    if (!current?.signingRequestId)
      throw new SigningBridgeError("AGREEMENT_NOT_STARTED", 409);
    await tx
      .update(agents)
      .set({
        onboardingSigningClosure: {
          requestId: current.signingRequestId,
          status: "requested",
          reason,
          actorId,
          at: new Date().toISOString(),
        },
      })
      .where(eq(agents.id, agentId));
    await tx
      .insert(onboardingEvents)
      .values(
        onboardingEventValues({
          agentId,
          actorAgentId: actorId,
          eventType: "online_invitations_close_requested",
          detail: { requestId: current.signingRequestId, reason },
        }),
      );
    return current;
  });
  try {
    await signingBridgeJson(
      `/v1/requests/${agent.signingRequestId}/commands`,
      actor,
      signingRequestSchema,
      { action: "close", reason },
    );
    const [fresh] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    if (fresh?.signingRequestId === agent.signingRequestId)
      await syncOnboardingAgreement(fresh);
    await db
      .update(agents)
      .set({
        onboardingSigningClosure: {
          requestId: agent.signingRequestId!,
          status: "completed",
          reason,
          actorId,
          at: new Date().toISOString(),
        },
      })
      .where(
        and(
          eq(agents.id, agentId),
          eq(agents.signingRequestId, agent.signingRequestId!),
        ),
      );
    await db
      .insert(onboardingEvents)
      .values(
        onboardingEventValues({
          agentId,
          actorAgentId: actorId,
          eventType: "online_invitations_closed",
          detail: { requestId: agent.signingRequestId, reason },
        }),
      );
    return { success: true };
  } catch (error) {
    const code =
      error instanceof SigningBridgeError ? error.code : "SIGNING_UNAVAILABLE";
    await db
      .update(agents)
      .set({
        onboardingSigningClosure: {
          requestId: agent.signingRequestId!,
          status: "failed",
          reason,
          actorId,
          at: new Date().toISOString(),
          error: code,
        },
      })
      .where(
        and(
          eq(agents.id, agentId),
          eq(agents.signingRequestId, agent.signingRequestId!),
        ),
      );
    await db
      .insert(onboardingEvents)
      .values(
        onboardingEventValues({
          agentId,
          actorAgentId: actorId,
          eventType: "online_invitations_close_failed",
          detail: { requestId: agent.signingRequestId, reason, error: code },
        }),
      );
    throw error;
  }
}
