import type { NewOnboardingEvent } from "@/db/schema";

type ActorSession = {
  user: { agentId?: number | null; email?: string | null };
} | null | undefined;

export function onboardingEventValues(input: {
  eventType: string;
  session?: ActorSession;
  actorAgentId?: number | null;
  actorEmail?: string | null;
  agentId?: number | null;
  invitationId?: number | null;
  teamJoinRequestId?: number | null;
  teamId?: number | null;
  detail?: Record<string, unknown> | null;
}): NewOnboardingEvent {
  return {
    eventType: input.eventType.slice(0, 80),
    agentId: input.agentId ?? null,
    actorAgentId: input.actorAgentId ?? input.session?.user.agentId ?? null,
    actorEmail:
      input.actorEmail?.trim().toLowerCase() ||
      input.session?.user.email?.trim().toLowerCase() ||
      null,
    invitationId: input.invitationId ?? null,
    teamJoinRequestId: input.teamJoinRequestId ?? null,
    teamId: input.teamId ?? null,
    detail: input.detail ?? null,
    createdAt: new Date().toISOString(),
  };
}
