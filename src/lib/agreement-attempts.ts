import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { onboardingEvents } from "@/db/schema";
import { lockOnboardingAgent, type DbTransaction } from "@/lib/advisory-locks";
import { onboardingEventValues } from "@/lib/onboarding-events";

type AttemptSubject = { scope: "onboarding" | "team_leader"; subjectId: number; agentId: number };
export type AgreementAttempt = { id: number; expiresAt: string; replacement: boolean };

export class AgreementAttemptChanged extends Error {}

export async function latestAgreementAttempt(tx: DbTransaction, subject: AttemptSubject) {
  const [event] = await tx.select().from(onboardingEvents).where(and(
    eq(onboardingEvents.eventType, "agreement_attempt_started"),
    eq(onboardingEvents.agentId, subject.agentId),
    sql`${onboardingEvents.detail}->>'scope' = ${subject.scope}`,
    sql`${onboardingEvents.detail}->>'subjectId' = ${String(subject.subjectId)}`,
  )).orderBy(desc(onboardingEvents.id)).limit(1);
  return event;
}

// Call while holding the onboarding-agent lock. The append-only event is the
// durable attempt identity and preserves the replaced contract's evidence trail.
export async function claimAgreementAttempt(
  tx: DbTransaction,
  subject: AttemptSubject,
  previous?: Record<string, unknown>,
): Promise<AgreementAttempt> {
  const existing = previous ? undefined : await latestAgreementAttempt(tx, subject);
  const event = existing || (await tx.insert(onboardingEvents).values(onboardingEventValues({
    eventType: "agreement_attempt_started",
    agentId: subject.agentId,
    actorAgentId: subject.agentId,
    detail: {
      scope: subject.scope,
      subjectId: subject.subjectId,
      replacement: Boolean(previous),
      expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      ...(previous ? { previous } : {}),
    },
  })).returning())[0];
  return { id: event.id, expiresAt: String(event.detail!.expiresAt), replacement: event.detail!.replacement === true };
}

export function agreementAttemptReference(base: string, attempt: AgreementAttempt) {
  // Preserve legacy first-attempt keys, including recovery after a lost response.
  return attempt.replacement ? `${base}-attempt-${attempt.id}` : base;
}

export async function withAgreementAttempt<T>(
  subject: AttemptSubject,
  attemptId: number,
  action: (tx: DbTransaction) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await lockOnboardingAgent(tx, subject.agentId);
    const current = await latestAgreementAttempt(tx, subject);
    if (current?.id !== attemptId) throw new AgreementAttemptChanged("The agreement was replaced by another request.");
    return action(tx);
  });
}
