import "server-only";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, pgPool } from "@/db";
import { agents, teamLeaderApplications } from "@/db/schema";
import { syncOnboardingAgreement } from "@/lib/onboarding-agreement";
import { syncTeamLeaderAgreement } from "@/lib/team-leader-agreement";
import { SigningBridgeError } from "@/lib/signing-bridge";

export const signingEventSchema = z
  .object({
    id: z.uuid(),
    event: z.literal("signing.changed"),
    requestId: z.uuid(),
    ownerAgentId: z.number().int().positive(),
    scenario: z.enum(["onboarding", "team_leader"]),
    occurredAt: z.iso.datetime(),
  })
  .strict();
export async function receiveSigningEvent(raw: unknown) {
  const event = signingEventSchema.parse(raw);
  await pgPool.query(
    "INSERT INTO portal.signing_event_inbox(id,request_id,owner_agent_id,scenario) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
    [event.id, event.requestId, event.ownerAgentId, event.scenario],
  );
  const {
    rows: [saved],
  } = await pgPool.query(
    "SELECT * FROM portal.signing_event_inbox WHERE id=$1",
    [event.id],
  );
  if (
    saved.request_id !== event.requestId ||
    saved.owner_agent_id !== event.ownerAgentId ||
    saved.scenario !== event.scenario
  )
    throw new SigningBridgeError("EVENT_CONFLICT", 409);
  if (saved.processed_at) return { replayed: true };
  // A row lease survives Vercel restarts and works with transaction poolers.
  // Do not hold a database connection while calling the signing provider.
  const { rows } = await pgPool.query(
    "UPDATE portal.signing_event_inbox SET lease_until=NOW()+INTERVAL '5 minutes',attempts=attempts+1 WHERE id=$1 AND processed_at IS NULL AND (lease_until IS NULL OR lease_until < NOW()) RETURNING id",
    [event.id],
  );
  if (!rows.length) throw new SigningBridgeError("EVENT_PROCESSING", 409);
  try {
    if (event.scenario === "onboarding") {
      const [agent] = await db
        .select()
        .from(agents)
        .where(eq(agents.id, event.ownerAgentId))
        .limit(1);
      if (!agent) throw new SigningBridgeError("EVENT_OWNER_NOT_FOUND", 409);
      if (agent.signingRequestId === event.requestId)
        await syncOnboardingAgreement(agent);
      else await assertSuperseded(event.requestId);
    } else {
      const [application] = await db
        .select()
        .from(teamLeaderApplications)
        .where(eq(teamLeaderApplications.signingRequestId, event.requestId))
        .limit(1);
      if (!application) await assertSuperseded(event.requestId);
      else {
        if (application.applicantAgentId !== event.ownerAgentId)
          throw new SigningBridgeError("EVENT_OWNER_MISMATCH", 409);
        await syncTeamLeaderAgreement(application);
      }
    }
    await pgPool.query(
      "UPDATE portal.signing_event_inbox SET processed_at=NOW(),last_error=NULL,lease_until=NULL WHERE id=$1",
      [event.id],
    );
    return { accepted: true };
  } catch (error) {
    await pgPool.query(
      "UPDATE portal.signing_event_inbox SET lease_until=NULL,last_error=$2 WHERE id=$1",
      [
        event.id,
        error instanceof SigningBridgeError ? error.code : "EVENT_SYNC_FAILED",
      ],
    );
    throw error;
  }
}
async function assertSuperseded(requestId: string) {
  const { rows } = await pgPool.query(
    "SELECT id FROM portal.onboarding_events WHERE detail->>'requestId'=$1 AND event_type IN ('documenso_agreement_superseded','team_leader_agreement_superseded') LIMIT 1",
    [requestId],
  );
  // The initial provider callback can race with the durable Portal binding.
  // Retry it; never acknowledge a request that has not yet been bound.
  if (!rows.length)
    throw new SigningBridgeError("EVENT_BINDING_NOT_READY", 409);
}
