import "server-only";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { agents, onboardingEvents } from "@/db/schema";
import { lockOnboardingAgent } from "@/lib/advisory-locks";
import {
  createESignSignerAccess,
  esignEnvelopeHasExpired,
  getESignEnvelope,
  resendESignRecipient,
} from "@/lib/esign";

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
  if (!agent.esignEnvelopeId)
    return { agent, envelope: null, signer: null, countersigner: null };
  const envelope = await getESignEnvelope(agent.esignEnvelopeId);
  if (
    envelope.id !== agent.esignEnvelopeId ||
    (agent.esignTemplateVersionId &&
      envelope.templateVersionId !== agent.esignTemplateVersionId)
  ) {
    throw new SigningAccessError("AGREEMENT_CHANGED");
  }
  const signers =
    envelope.recipients?.filter((recipient) => recipient.kind === "signer") ||
    [];
  const signer =
    signers.length === 1 &&
    signers[0].email.trim().toLowerCase() === agent.email.trim().toLowerCase()
      ? signers[0]
      : null;
  const countersigner =
    envelope.recipients?.find(
      (recipient) => recipient.kind === "countersigner",
    ) || null;
  return { agent, envelope, signer, countersigner };
}

export async function requestOnboardingSigning(input: {
  agentId: number;
  actorId: number;
  action: "continue" | "resend";
  countersigner?: boolean;
}) {
  // A privileged administrator can send a reminder, never obtain another
  // person's signing link. The route separately verifies fresh admin access.
  if (
    input.action === "continue" &&
    (input.actorId !== input.agentId || input.countersigner)
  ) {
    throw new SigningAccessError("FORBIDDEN", 403);
  }
  const current = await inspectOnboardingSigning(input.agentId);
  const { agent, envelope } = current;
  if (agent.accountStatus === "inactive")
    throw new SigningAccessError("INACTIVE_ACCOUNT", 403);
  if (!envelope) throw new SigningAccessError("AGREEMENT_NOT_STARTED");
  const recipient = input.countersigner
    ? current.countersigner
    : current.signer;
  if (!recipient) throw new SigningAccessError("SIGNER_MISMATCH");
  if (recipient.status === "COMPLETED")
    throw new SigningAccessError("ALREADY_SIGNED");
  if (esignEnvelopeHasExpired(envelope) || envelope.status === "EXPIRED")
    throw new SigningAccessError("AGREEMENT_EXPIRED");
  if (
    !["SENT", "IN_PROGRESS"].includes(envelope.status) ||
    !["ACTIVE", "VIEWED", "IN_PROGRESS"].includes(recipient.status)
  ) {
    throw new SigningAccessError("SIGNING_UNAVAILABLE");
  }
  const eventType =
    input.action === "continue"
      ? "agreement.link_requested"
      : "agreement.reminder_requested";
  // Commit the cooldown before calling the external service, so a lost
  // response cannot cause concurrent or repeated reminder emails.
  await db.transaction(async (tx) => {
    await lockOnboardingAgent(tx, agent.id);
    const [fresh] = await tx
      .select()
      .from(agents)
      .where(eq(agents.id, agent.id))
      .limit(1);
    if (
      !fresh ||
      fresh.esignEnvelopeId !== envelope.id ||
      fresh.email !== agent.email ||
      fresh.accountStatus === "inactive"
    ) {
      throw new SigningAccessError("AGREEMENT_CHANGED");
    }
    if (input.actorId !== agent.id || input.countersigner) {
      const [actor] = await tx
        .select({
          isAdmin: agents.isAdmin,
          accountStatus: agents.accountStatus,
        })
        .from(agents)
        .where(eq(agents.id, input.actorId))
        .limit(1);
      if (!actor?.isAdmin || actor.accountStatus !== "active")
        throw new SigningAccessError("FORBIDDEN", 403);
    }
    const seconds = input.action === "continue" ? 10 : 60;
    const [recent] = await tx
      .select({ id: onboardingEvents.id })
      .from(onboardingEvents)
      .where(
        and(
          eq(onboardingEvents.agentId, agent.id),
          inArray(onboardingEvents.eventType, [eventType]),
          gte(
            onboardingEvents.createdAt,
            new Date(Date.now() - seconds * 1000).toISOString(),
          ),
        ),
      )
      .orderBy(desc(onboardingEvents.createdAt))
      .limit(1);
    if (recent) throw new SigningAccessError("TOO_MANY_REQUESTS", 429);
    await tx
      .insert(onboardingEvents)
      .values({
        agentId: agent.id,
        actorAgentId: input.actorId,
        eventType,
        detail: {
          envelopeId: envelope.id,
          recipientId: recipient.id,
          recipientKind: recipient.kind,
        },
      });
  });
  const result =
    input.action === "continue"
      ? {
          url: await createESignSignerAccess(
            envelope.id,
            recipient.id,
            agent.email,
          ),
        }
      : (await resendESignRecipient(envelope.id, recipient.id),
        { sent: true, email: recipient.email });
  await db
    .insert(onboardingEvents)
    .values({
      agentId: agent.id,
      actorAgentId: input.actorId,
      eventType:
        input.action === "continue"
          ? "agreement.link_issued"
          : "agreement.reminder_sent",
      detail: { envelopeId: envelope.id, recipientId: recipient.id },
    });
  return result;
}
