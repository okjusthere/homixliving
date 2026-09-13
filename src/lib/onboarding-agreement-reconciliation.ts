import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { agents, settings, teamLeaderApplications } from "@/db/schema";
import { syncOnboardingAgreement } from "@/lib/onboarding-agreement";
import { syncTeamLeaderAgreement } from "@/lib/team-leader-agreement";

const CURSOR_KEY = "onboarding_agreement_reconciliation_cursor";
const BATCH_SIZE = 25;
const CONCURRENCY = 5;
const eligible = () =>
  and(
    isNotNull(agents.signingRequestId),
    inArray(agents.agreementStatus, ["preparing", "sent", "failed", "expired"]),
  );

export async function claimOnboardingAgreementBatch() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(31005, 1)`);
    const [saved] = await tx
      .select()
      .from(settings)
      .where(eq(settings.key, CURSOR_KEY))
      .limit(1);
    let cursor = { after: 0, through: 0 };
    if (saved) {
      const parsed = JSON.parse(saved.value) as typeof cursor;
      if (
        Number.isSafeInteger(parsed.after) &&
        Number.isSafeInteger(parsed.through) &&
        parsed.after >= 0 &&
        parsed.through >= parsed.after
      )
        cursor = parsed;
    }
    const beginCycle = async () => {
      const [last] = await tx
        .select({ id: agents.id })
        .from(agents)
        .where(eligible())
        .orderBy(desc(agents.id))
        .limit(1);
      cursor = { after: 0, through: last?.id || 0 };
    };
    if (cursor.after >= cursor.through) await beginCycle();
    const page = () =>
      tx
        .select()
        .from(agents)
        .where(
          and(
            eligible(),
            gt(agents.id, cursor.after),
            lte(agents.id, cursor.through),
          ),
        )
        .orderBy(asc(agents.id))
        .limit(BATCH_SIZE);
    let rows = await page();
    if (!rows.length && cursor.after > 0) {
      await beginCycle();
      rows = await page();
    }
    cursor.after = rows.at(-1)?.id || cursor.through;
    // Claim before remote calls: errors and interrupted runs cannot monopolize
    // the head of the queue. A fixed cycle boundary also prevents new arrivals
    // from indefinitely delaying retries of earlier pending envelopes.
    await tx
      .insert(settings)
      .values({ key: CURSOR_KEY, value: JSON.stringify(cursor) })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: JSON.stringify(cursor) },
      });
    return {
      rows,
      cycleComplete: rows.length < BATCH_SIZE || cursor.after >= cursor.through,
    };
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
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
        while (next < rows.length) {
          const agent = rows[next++];
          try {
            const synced = await syncOnboardingAgreement(agent);
            if (synced.agreementStatus === "completed") completed++;
          } catch {
            console.error("Onboarding agreement reconciliation failed", {
              agentId: agent.id,
              requestId: agent.signingRequestId,
            });
            failures.push(agent.id);
          }
        }
      }),
    );
    hasMore = !cycleComplete;
  } while (hasMore && Date.now() + 200_000 < deadline);
  return {
    scanned,
    completed,
    hasMore,
    failed: failures.length,
    failures: failures.sort((a, b) => a - b),
  };
}

export async function reconcileTeamLeaderAgreements() {
  const key = "team_leader_agreement_reconciliation_cursor";
  const eligibleApplication = () =>
    and(
      isNotNull(teamLeaderApplications.signingRequestId),
      or(
        inArray(teamLeaderApplications.agreementStatus, [
          "preparing",
          "sent",
          "failed",
          "expired",
        ]),
        and(
          eq(teamLeaderApplications.agreementStatus, "completed"),
          eq(teamLeaderApplications.status, "approved"),
        ),
      ),
    );
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(31005, 2)`);
    const [saved] = await tx
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    let cursor = { after: 0, through: 0 };
    try {
      const parsed = JSON.parse(saved?.value || "null");
      if (
        parsed &&
        Number.isSafeInteger(parsed.after) &&
        Number.isSafeInteger(parsed.through) &&
        parsed.after >= 0 &&
        parsed.through >= parsed.after
      )
        cursor = parsed;
    } catch {
      /* An older numeric cursor starts a new bounded cycle. */
    }
    const beginCycle = async () => {
      const [last] = await tx
        .select({ id: teamLeaderApplications.id })
        .from(teamLeaderApplications)
        .where(eligibleApplication())
        .orderBy(desc(teamLeaderApplications.id))
        .limit(1);
      cursor = { after: 0, through: last?.id || 0 };
    };
    if (cursor.after >= cursor.through) await beginCycle();
    const selectPage = () =>
      tx
        .select()
        .from(teamLeaderApplications)
        .where(
          and(
            eligibleApplication(),
            gt(teamLeaderApplications.id, cursor.after),
            lte(teamLeaderApplications.id, cursor.through),
          ),
        )
        .orderBy(asc(teamLeaderApplications.id))
        .limit(BATCH_SIZE);
    let applications = await selectPage();
    if (!applications.length && cursor.after) {
      await beginCycle();
      applications = await selectPage();
    }
    cursor.after = applications.at(-1)?.id || cursor.through;
    await tx
      .insert(settings)
      .values({ key, value: JSON.stringify(cursor) })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: JSON.stringify(cursor) },
      });
    return applications;
  });
  let next = 0,
    completed = 0;
  const failures: number[] = [];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      while (next < rows.length) {
        const application = rows[next++];
        try {
          const updated = await syncTeamLeaderAgreement(application);
          if (updated.agreementStatus === "completed") completed++;
        } catch {
          console.error("Team Leader signing reconciliation failed", {
            applicationId: application.id,
            requestId: application.signingRequestId,
          });
          failures.push(application.id);
        }
      }
    }),
  );
  return { scanned: rows.length, completed, failed: failures.length, failures };
}
