import { and, asc, desc, eq, gt, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents, settings } from "@/db/schema";
import { syncOnboardingAgreement } from "@/lib/onboarding-agreement";

const CURSOR_KEY = "onboarding_agreement_reconciliation_cursor";
const BATCH_SIZE = 25;
const CONCURRENCY = 5;
const eligible = () => and(
  isNotNull(agents.esignEnvelopeId),
  inArray(agents.agreementStatus, ["preparing", "sent", "failed"]),
);

export async function claimOnboardingAgreementBatch() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(31005, 1)`);
    const [saved] = await tx.select().from(settings).where(eq(settings.key, CURSOR_KEY)).limit(1);
    let cursor = { after: 0, through: 0 };
    if (saved) {
      const parsed = JSON.parse(saved.value) as typeof cursor;
      if (Number.isSafeInteger(parsed.after) && Number.isSafeInteger(parsed.through) && parsed.after >= 0 && parsed.through >= parsed.after) cursor = parsed;
    }
    const beginCycle = async () => {
      const [last] = await tx.select({ id: agents.id }).from(agents).where(eligible()).orderBy(desc(agents.id)).limit(1);
      cursor = { after: 0, through: last?.id || 0 };
    };
    if (cursor.after >= cursor.through) await beginCycle();
    const page = () => tx.select().from(agents).where(and(
      eligible(), gt(agents.id, cursor.after), lte(agents.id, cursor.through),
    )).orderBy(asc(agents.id)).limit(BATCH_SIZE);
    let rows = await page();
    if (!rows.length && cursor.after > 0) {
      await beginCycle();
      rows = await page();
    }
    cursor.after = rows.at(-1)?.id || cursor.through;
    // Claim before remote calls: errors and interrupted runs cannot monopolize
    // the head of the queue. A fixed cycle boundary also prevents new arrivals
    // from indefinitely delaying retries of earlier pending envelopes.
    await tx.insert(settings).values({ key: CURSOR_KEY, value: JSON.stringify(cursor) })
      .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(cursor) } });
    return { rows, cycleComplete: rows.length < BATCH_SIZE || cursor.after >= cursor.through };
  });
}

export async function reconcileOnboardingAgreements() {
  // Completion reads both the envelope and its evidence. Bound each page and
  // leave room for remote timeouts plus DB work inside the route's 300s limit.
  const deadline = Date.now() + 240_000;
  let completed = 0;
  let scanned = 0;
  let hasMore = true;
  const failures: number[] = [];
  do {
    const { rows, cycleComplete } = await claimOnboardingAgreementBatch();
    scanned += rows.length;
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      while (next < rows.length) {
        const agent = rows[next++];
        try {
          const synced = await syncOnboardingAgreement(agent);
          if (synced.agreementStatus === "completed") completed++;
        } catch {
          console.error("Onboarding agreement reconciliation failed", { agentId: agent.id, envelopeId: agent.esignEnvelopeId });
          failures.push(agent.id);
        }
      }
    }));
    hasMore = !cycleComplete;
  } while (hasMore && Date.now() + 200_000 < deadline);
  return { scanned, completed, hasMore, failed: failures.length, failures: failures.sort((a, b) => a - b) };
}
