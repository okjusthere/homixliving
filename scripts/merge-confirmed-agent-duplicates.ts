/**
 * Merge the three production duplicates that were manually confirmed on
 * 2026-09-10. Dry-run is the default; --apply is required for any write.
 *
 *   DATABASE_URL=... npx tsx scripts/merge-confirmed-agent-duplicates.ts
 *   DATABASE_URL=... MERGED_BY_EMAIL=admin@homixny.com \
 *     npx tsx scripts/merge-confirmed-agent-duplicates.ts --apply
 *
 * This is intentionally not a general-purpose "merge any id" utility. The
 * exact ids and emails are part of the safety boundary. Every source row is
 * snapshotted in portal.agent_merge_history before deletion, login aliases are
 * retained, permitted history is moved, and any unexpected business reference
 * aborts the entire transaction.
 */
import postgres from "postgres";

type Sql = postgres.Sql;
type QuerySql = postgres.Sql | postgres.TransactionSql;

type ConfirmedMerge = {
  sourceId: number;
  sourceEmail: string;
  targetId: number;
  targetEmail: string;
  reason: string;
};

type AgentRow = Record<string, unknown> & {
  id: number;
  name: string;
  email: string;
  account_status: string;
};

type ForeignKeyReference = {
  schema_name: string;
  table_name: string;
  column_name: string;
};

const CONFIRMED_MERGES: readonly ConfirmedMerge[] = [
  {
    sourceId: 27808,
    sourceEmail: "limeixuan001@gmail.com",
    targetId: 27689,
    targetEmail: "michelleliny001@gmail.com",
    reason: "confirmed duplicate of Meixuan Li (Michelle)",
  },
  {
    sourceId: 27810,
    sourceEmail: "kertweller@gmail.com",
    targetId: 1463,
    targetEmail: "wellerkert@gmail.com",
    reason: "confirmed duplicate of Kert Weller; failed e-sign state retained in merge snapshot",
  },
  {
    sourceId: 1064,
    sourceEmail: "eric.wei@kevv.ai",
    targetId: 11762,
    targetEmail: "eric.wei@homixny.com",
    reason: "confirmed duplicate of Zhengle Wei",
  },
] as const;

// These references are identity or activity history and can be reassigned
// without changing money, team terms, deals, or legal ownership.
const MOVABLE_REFERENCES = new Set([
  "portal.agent_email_addresses.agent_id",
  "portal.agent_email_addresses.created_by_agent_id",
  "portal.agent_login_identities.agent_id",
  "portal.agent_login_identities.created_by_agent_id",
  "portal.onboarding_events.agent_id",
  "portal.onboarding_events.actor_agent_id",
  "portal.training_video_views.agent_id",
]);

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function loadForeignKeyReferences(sql: Sql): Promise<ForeignKeyReference[]> {
  return sql<ForeignKeyReference[]>`
    SELECT
      source_namespace.nspname AS schema_name,
      source_table.relname AS table_name,
      source_column.attname AS column_name
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS source_table
      ON source_table.oid = constraint_row.conrelid
    JOIN pg_namespace AS source_namespace
      ON source_namespace.oid = source_table.relnamespace
    JOIN LATERAL unnest(constraint_row.conkey) AS key_column(attnum)
      ON TRUE
    JOIN pg_attribute AS source_column
      ON source_column.attrelid = source_table.oid
     AND source_column.attnum = key_column.attnum
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'portal.agents'::regclass
    ORDER BY source_namespace.nspname, source_table.relname, source_column.attname
  `;
}

async function referenceCounts(
  sql: QuerySql,
  sourceId: number,
  references: ForeignKeyReference[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const reference of references) {
    const key = `${reference.schema_name}.${reference.table_name}.${reference.column_name}`;
    const relation = `${quoteIdentifier(reference.schema_name)}.${quoteIdentifier(reference.table_name)}`;
    const column = quoteIdentifier(reference.column_name);
    const [row] = await sql.unsafe<{ count: number }[]>(
      `SELECT COUNT(*)::INTEGER AS count FROM ${relation} WHERE ${column} = $1`,
      [sourceId],
    );
    if (row && row.count > 0) counts[key] = row.count;
  }
  return counts;
}

async function validateMerge(
  sql: QuerySql,
  merge: ConfirmedMerge,
  references: ForeignKeyReference[],
  lock: boolean,
) {
  const lockClause = lock ? " FOR UPDATE" : "";
  const rows = await sql.unsafe<AgentRow[]>(
    `SELECT * FROM portal.agents WHERE id IN ($1, $2) ORDER BY id${lockClause}`,
    [merge.sourceId, merge.targetId],
  );
  const source = rows.find((row) => row.id === merge.sourceId);
  const target = rows.find((row) => row.id === merge.targetId);
  if (!source || !target) {
    throw new Error(`Merge ${merge.sourceId} -> ${merge.targetId} aborted: source or target is missing.`);
  }
  if (normalizeEmail(source.email) !== merge.sourceEmail || normalizeEmail(target.email) !== merge.targetEmail) {
    throw new Error(
      `Merge ${merge.sourceId} -> ${merge.targetId} aborted: an expected email no longer matches.`,
    );
  }

  const [existingMerge] = await sql<{ source_agent_id: number }[]>`
    SELECT source_agent_id
    FROM portal.agent_merge_history
    WHERE source_agent_id = ${merge.sourceId}
  `;
  if (existingMerge) {
    throw new Error(`Source #${merge.sourceId} was already merged.`);
  }

  const [publicProfile] = await sql<{ slug: string }[]>`
    SELECT slug FROM public.agents WHERE portal_agent_id = ${merge.sourceId} LIMIT 1
  `;
  if (publicProfile) {
    throw new Error(
      `Merge #${merge.sourceId} aborted: public profile ${publicProfile.slug} still points to the source.`,
    );
  }

  const counts = await referenceCounts(sql, merge.sourceId, references);
  const unexpected = Object.entries(counts).filter(([key]) => !MOVABLE_REFERENCES.has(key));
  if (unexpected.length > 0) {
    throw new Error(
      `Merge #${merge.sourceId} aborted: unexpected references ${unexpected
        .map(([key, count]) => `${key}=${count}`)
        .join(", ")}.`,
    );
  }

  return { source, target, counts };
}

async function applyMerge(
  tx: postgres.TransactionSql,
  merge: ConfirmedMerge,
  references: ForeignKeyReference[],
  mergedByEmail: string,
) {
  const { source, target, counts } = await validateMerge(tx, merge, references, true);

  // Preserve the old email as a verified login alias on the canonical person.
  await tx`
    UPDATE portal.agent_email_addresses
    SET agent_id = ${merge.targetId},
        is_primary = FALSE,
        can_sign_in = TRUE,
        source = 'confirmed_duplicate_merge',
        updated_at = NOW()
    WHERE agent_id = ${merge.sourceId}
  `;
  await tx`
    UPDATE portal.agent_email_addresses
    SET created_by_agent_id = ${merge.targetId}, updated_at = NOW()
    WHERE created_by_agent_id = ${merge.sourceId}
  `;

  // Stable Google subjects remain usable, but only the canonical identity is
  // primary. This lets either previously verified Google account sign in.
  await tx`
    UPDATE portal.agent_login_identities
    SET agent_id = ${merge.targetId},
        is_primary = FALSE,
        source = 'confirmed_duplicate_merge',
        updated_at = NOW()
    WHERE agent_id = ${merge.sourceId}
  `;
  await tx`
    UPDATE portal.agent_login_identities
    SET created_by_agent_id = ${merge.targetId}, updated_at = NOW()
    WHERE created_by_agent_id = ${merge.sourceId}
  `;

  const onboardingOwner = await tx`
    UPDATE portal.onboarding_events
    SET agent_id = ${merge.targetId}
    WHERE agent_id = ${merge.sourceId}
    RETURNING id
  `;
  const onboardingActor = await tx`
    UPDATE portal.onboarding_events
    SET actor_agent_id = ${merge.targetId}
    WHERE actor_agent_id = ${merge.sourceId}
    RETURNING id
  `;
  const trainingViews = await tx`
    UPDATE portal.training_video_views
    SET agent_id = ${merge.targetId}, updated_at = NOW()
    WHERE agent_id = ${merge.sourceId}
    RETURNING id
  `;

  const movedReferences = {
    ...counts,
    moved: {
      onboardingEventOwner: onboardingOwner.length,
      onboardingEventActor: onboardingActor.length,
      trainingVideoViews: trainingViews.length,
    },
    reason: merge.reason,
  };

  await tx`
    INSERT INTO portal.agent_merge_history (
      source_agent_id,
      target_agent_id,
      source_email,
      source_snapshot,
      moved_references,
      merged_by_email
    ) VALUES (
      ${merge.sourceId},
      ${merge.targetId},
      ${merge.sourceEmail},
      ${tx.json(source as unknown as postgres.JSONValue)},
      ${tx.json(movedReferences)},
      ${mergedByEmail}
    )
  `;

  await tx`DELETE FROM portal.agents WHERE id = ${merge.sourceId}`;
  await tx`
    INSERT INTO portal.audit_log (
      actor_email, action, entity_type, entity_id, summary, detail
    ) VALUES (
      ${mergedByEmail},
      'merge',
      'agent',
      ${String(merge.targetId)},
      ${`Merged confirmed duplicate agent #${merge.sourceId} into #${merge.targetId}`},
      ${JSON.stringify({
        sourceAgentId: merge.sourceId,
        sourceEmail: merge.sourceEmail,
        targetAgentId: merge.targetId,
        targetEmail: target.email,
        movedReferences,
      })}
    )
  `;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("Set DATABASE_URL.");
  const apply = process.argv.includes("--apply");
  const mergedByEmail = process.env.MERGED_BY_EMAIL?.trim() || "manual-production-cleanup";
  const sql = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => {} });

  try {
    const requiredTables = await sql<{ identity_ready: boolean }[]>`
      SELECT to_regclass('portal.agent_email_addresses') IS NOT NULL
         AND to_regclass('portal.agent_merge_history') IS NOT NULL AS identity_ready
    `;
    if (!requiredTables[0]?.identity_ready) {
      throw new Error("Run db/migrations/20260910-agent-identity-model.sql before this script.");
    }

    const references = await loadForeignKeyReferences(sql);
    const report = [];
    for (const merge of CONFIRMED_MERGES) {
      const { source, target, counts } = await validateMerge(sql, merge, references, false);
      report.push({
        source: `#${source.id} ${source.email}`,
        sourceStatus: source.account_status,
        target: `#${target.id} ${target.email}`,
        targetStatus: target.account_status,
        references: Object.entries(counts).map(([key, count]) => `${key}=${count}`).join("; ") || "none",
      });
    }

    console.log(apply ? "Confirmed duplicate merge — APPLY" : "Confirmed duplicate merge — DRY RUN");
    console.table(report);
    if (!apply) {
      console.log("No writes made. Re-run with --apply after reviewing this report.");
      return;
    }

    await sql.begin(async (tx) => {
      for (const merge of CONFIRMED_MERGES) {
        await applyMerge(tx, merge, references, mergedByEmail);
      }
    });
    console.log(`Merged ${CONFIRMED_MERGES.length} confirmed duplicates in one transaction.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("Confirmed duplicate merge failed", error);
  process.exitCode = 1;
});
