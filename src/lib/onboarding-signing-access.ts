import "server-only";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, onboardingEvents } from "@/db/schema";
import {
  signingActor,
  signingBridgeJson,
  SigningBridgeError,
} from "@/lib/signing-bridge";
import { getOnboardingSigningRequest } from "@/lib/signing-onboarding";
import { signingRequestSchema } from "@/lib/signing-contract";
import { onboardingEventValues } from "@/lib/onboarding-events";

export class SigningAccessError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
  ) {
    super(code);
  }
}

export async function inspectOnboardingSigning(agentId: number) {
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  if (!agent) throw new SigningAccessError("AGENT_NOT_FOUND", 404);
  return {
    agent,
    request: agent.signingRequestId
      ? await getOnboardingSigningRequest(agent)
      : null,
  };
}

export async function requestOnboardingSigning(input: {
  agentId: number;
  actorId: number;
  action: "continue" | "resend";
  countersigner?: boolean;
}) {
  const actor = await signingActor();
  if (
    actor.agentId !== input.actorId ||
    (input.agentId !== actor.agentId && !actor.admin)
  )
    throw new SigningAccessError("FORBIDDEN", 403);
  // Administrators can remind another signer; their identity cannot be used
  // to obtain that person's bearer signing URL.
  if (
    input.action === "continue" &&
    (input.agentId !== actor.agentId || input.countersigner)
  )
    throw new SigningAccessError("FORBIDDEN", 403);
  const { agent, request } = await inspectOnboardingSigning(input.agentId);
  if (agent.accountStatus === "inactive")
    throw new SigningAccessError("INACTIVE_ACCOUNT", 403);
  if (!request) throw new SigningAccessError("AGREEMENT_NOT_STARTED");
  if (request.parts.some((part) => part.error))
    throw new SigningAccessError("SIGNING_UNAVAILABLE", 503);
  try {
    if (input.action === "resend") {
      if (input.countersigner && !actor.admin)
        throw new SigningAccessError("FORBIDDEN", 403);
      const target = input.countersigner ? "company" : "owner";
      const recipients = request.parts.flatMap((part) =>
        part.document?.status === "PENDING"
          ? part.document.recipients.filter(
              (r) =>
                r.actor === target &&
                r.signingStatus === "NOT_SIGNED" &&
                r.role !== "CC",
            )
          : [],
      );
      if (!recipients.length) throw new SigningAccessError("ALREADY_SIGNED");
      await signingBridgeJson(
        `/v1/requests/${request.id}/commands`,
        actor,
        signingRequestSchema,
        { action: "remind", recipientActor: target },
      );
      await db
        .insert(onboardingEvents)
        .values(
          onboardingEventValues({
            agentId: agent.id,
            actorAgentId: actor.agentId,
            eventType: "agreement.reminder_sent",
            detail: { requestId: request.id, recipientActor: target },
          }),
        );
      return {
        sent: true,
        email: [...new Set(recipients.map((r) => r.email))].join(", "),
      };
    }
    for (const part of request.parts) {
      if (part.document?.status !== "PENDING") continue;
      const recipient = part.document.recipients.find(
        (r) =>
          r.actor === "owner" &&
          r.role === "SIGNER" &&
          r.signingStatus === "NOT_SIGNED" &&
          actor.verifiedEmails.includes(r.email.toLowerCase()),
      );
      if (!recipient) continue;
      if (recipient.expiresAt && Date.parse(recipient.expiresAt) <= Date.now())
        throw new SigningAccessError("AGREEMENT_EXPIRED");
      const result = await signingBridgeJson(
        `/v1/requests/${request.id}/parts/${part.id}/access`,
        actor,
        z.object({ url: z.url() }),
        { kind: "signer", recipientId: recipient.id },
      );
      await db
        .insert(onboardingEvents)
        .values(
          onboardingEventValues({
            agentId: agent.id,
            actorAgentId: actor.agentId,
            eventType: "agreement.link_issued",
            detail: {
              requestId: request.id,
              partId: part.id,
              recipientId: recipient.id,
            },
          }),
        );
      return result;
    }
    throw new SigningAccessError("ALREADY_SIGNED");
  } catch (error) {
    if (error instanceof SigningBridgeError)
      throw new SigningAccessError(
        error.code === "REMINDER_RECENTLY_REQUESTED"
          ? "TOO_MANY_REQUESTS"
          : error.code,
        error.status,
      );
    throw error;
  }
}
