// Append-only audit trail. logAudit is fire-and-forget by design: a failed
// audit write logs to console but must never fail the request that triggered
// it (we'd rather lose one log line than block a deal save).
import { db } from "@/db";
import { auditLog } from "@/db/schema";

type ActorSession = { user: { email?: string | null } } | null | undefined;

export async function logAudit(
  session: ActorSession,
  action: string,
  entityType: string,
  entityId: string | number | null,
  summary: string,
  detail?: unknown
): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorEmail: session?.user?.email || null,
      action,
      entityType,
      entityId: entityId == null ? null : String(entityId),
      summary: summary.slice(0, 500),
      detail:
        detail === undefined
          ? null
          : JSON.stringify(detail, (_k, v) =>
              typeof v === "string" && v.length > 2000 ? v.slice(0, 2000) : v
            ).slice(0, 8000),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("audit log write failed", action, entityType, entityId, error);
  }
}
