import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { pgPool } from "@/db";
import { isConfiguredAdminEmail } from "./admin-emails";
import { isEmailChangeRequestActive } from "./email-change";
import { AgentEmailError, type EmailOwner } from "./admin-agent-emails";

type Person = Record<string, unknown> & {
  id: number;
  name: string;
  email: string;
  is_admin: boolean;
  account_status: string;
  agreement_status: string;
  payment_status: string;
  pending_email: string | null;
  email_change_requested_at: string | null;
};
type Reference = {
  schema_name: string;
  table_name: string;
  column_name: string;
};
type IdentityRow = Record<string, unknown> & {
  id: number;
  agent_id: number;
  email?: string;
  email_at_link?: string;
};
export type MergeBlocker =
  | "privileged"
  | "inactive"
  | "target_inactive"
  | "agreement"
  | "payment"
  | "team_terms"
  | "pending_link"
  | "website"
  | "website_unavailable"
  | "identity_conflict"
  | "business_records";
export type AgentMergePreview = {
  source: EmailOwner;
  target: EmailOwner;
  emails: Array<{ email: string; canSignIn: boolean }>;
  identityCount: number;
  activityCount: number;
  targetProfiles: string[];
  sourceProfiles: string[];
  blockers: Array<{ code: MergeBlocker; count?: number }>;
  revision: string;
};

// Only identity and simple activity references can move. All other foreign
// keys, including ones added by future migrations, block the operation.
const movable = new Set([
  "portal.agent_email_addresses.agent_id",
  "portal.agent_email_addresses.created_by_agent_id",
  "portal.agent_login_identities.agent_id",
  "portal.agent_login_identities.created_by_agent_id",
  "portal.onboarding_events.agent_id",
  "portal.onboarding_events.actor_agent_id",
  "portal.training_video_views.agent_id",
  "portal.notifications.recipient_agent_id",
]);
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const personView = (person: Person): EmailOwner => ({
  id: person.id,
  name: person.name,
  email: person.email,
  accountStatus: person.account_status,
});

async function inspect(client: PoolClient, sourceId: number, targetId: number) {
  if (sourceId === targetId) throw new AgentEmailError("SAME_AGENT", 400);
  const { rows: people } = await client.query<Person>(
    `SELECT * FROM portal.agents WHERE id=ANY($1::int[]) ORDER BY id`,
    [[sourceId, targetId]],
  );
  const source = people.find((person) => person.id === sourceId),
    target = people.find((person) => person.id === targetId);
  if (!source || !target) throw new AgentEmailError("AGENT_NOT_FOUND", 404);
  const { rows: addresses } = await client.query<IdentityRow>(
    `SELECT * FROM portal.agent_email_addresses WHERE agent_id=ANY($1::int[]) ORDER BY id`,
    [[sourceId, targetId]],
  );
  const { rows: identities } = await client.query<IdentityRow>(
    `SELECT * FROM portal.agent_login_identities WHERE agent_id=ANY($1::int[]) ORDER BY id`,
    [[sourceId, targetId]],
  );
  const sourceAddresses = addresses.filter((row) => row.agent_id === sourceId),
    sourceIdentities = identities.filter((row) => row.agent_id === sourceId);
  const sourceEmails = [
    ...new Set([
      source.email.toLowerCase(),
      ...sourceAddresses.map((row) => row.email!.toLowerCase()),
      ...sourceIdentities
        .map((row) => row.email_at_link?.toLowerCase())
        .filter((value): value is string => Boolean(value)),
    ]),
  ].sort();
  const { rows: conflicts } = await client.query(
    `SELECT id FROM portal.agents WHERE id<>$1 AND lower(email)=ANY($2::text[])
    UNION SELECT agent_id FROM portal.agent_email_addresses WHERE agent_id<>$1 AND lower(email)=ANY($2::text[])
    UNION SELECT agent_id FROM portal.agent_login_identities WHERE agent_id<>$1 AND lower(email_at_link)=ANY($2::text[])`,
    [sourceId, sourceEmails],
  );
  const blockers: AgentMergePreview["blockers"] = [];
  if (
    source.is_admin ||
    target.is_admin ||
    [...sourceEmails, target.email, ...addresses.map((row) => row.email!)].some(
      isConfiguredAdminEmail,
    )
  )
    blockers.push({ code: "privileged" });
  if (source.account_status === "inactive") blockers.push({ code: "inactive" });
  if (target.account_status !== "active")
    blockers.push({ code: "target_inactive" });
  if (
    source.agreement_status !== "not_started" ||
    [
      "esign_transaction_id",
      "esign_envelope_id",
      "esign_template_version_id",
      "esign_evidence_package_id",
      "agreement_agent_signed_at",
      "agreement_countersigned_at",
      "agreement_completed_at",
    ].some((key) => source[key])
  )
    blockers.push({ code: "agreement" });
  if (
    source.payment_status === "paid" ||
    [
      "stripe_customer_id",
      "affiliation_paid_at",
      "onboarding_completed_at",
    ].some((key) => source[key])
  )
    blockers.push({ code: "payment" });
  if (
    ["team_id", "team_terms_config_id", "team_terms_accepted_at"].some(
      (key) => source[key],
    )
  )
    blockers.push({ code: "team_terms" });
  if (
    source.pending_email &&
    isEmailChangeRequestActive(source.email_change_requested_at)
  )
    blockers.push({ code: "pending_link" });
  if (conflicts.length) blockers.push({ code: "identity_conflict" });

  // Read-only access to the shared website schema. Website writes remain owned
  // by Homix Web; a duplicate with a profile must be resolved there first.
  const {
    rows: [website],
  } = await client.query<{ present: boolean }>(
    `SELECT to_regclass('public.agents') IS NOT NULL AS present`,
  );
  if (!website.present) blockers.push({ code: "website_unavailable" });
  const profiles = website.present
    ? (
        await client.query<{ portal_agent_id: number; slug: string }>(
          `SELECT portal_agent_id,slug FROM public.agents WHERE portal_agent_id=ANY($1::int[]) ORDER BY slug`,
          [[sourceId, targetId]],
        )
      ).rows
    : [];
  const sourceProfiles = profiles
      .filter((row) => row.portal_agent_id === sourceId)
      .map((row) => row.slug),
    targetProfiles = profiles
      .filter((row) => row.portal_agent_id === targetId)
      .map((row) => row.slug);
  if (sourceProfiles.length)
    blockers.push({ code: "website", count: sourceProfiles.length });

  const { rows: references } =
    await client.query<Reference>(`SELECT ns.nspname AS schema_name,t.relname AS table_name,a.attname AS column_name
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace
    JOIN LATERAL unnest(c.conkey) AS k(attnum) ON TRUE JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum
    WHERE c.contype='f' AND c.confrelid='portal.agents'::regclass ORDER BY 1,2,3`);
  const counts: Record<string, number> = {};
  if (references.length) {
    const keys = references.map(
      (ref) => `${ref.schema_name}.${ref.table_name}.${ref.column_name}`,
    );
    const { rows } = await client.query<{ key: string; count: number }>(
      references
        .map(
          (ref, index) =>
            `SELECT $${index + 2}::text AS key,count(*)::int AS count FROM ${quote(ref.schema_name)}.${quote(ref.table_name)} WHERE ${quote(ref.column_name)}=$1`,
        )
        .join(" UNION ALL "),
      [sourceId, ...keys],
    );
    for (const row of rows) if (row.count) counts[row.key] = row.count;
  }
  const unsafeCount = Object.entries(counts)
    .filter(([key]) => !movable.has(key))
    .reduce((sum, [, count]) => sum + count, 0);
  if (unsafeCount)
    blockers.push({ code: "business_records", count: unsafeCount });
  const emails = sourceAddresses.map((row) => ({
    email: row.email!,
    canSignIn: Boolean(row.can_sign_in && row.verified_at),
  }));
  if (
    !emails.some(
      (row) => row.email.toLowerCase() === source.email.toLowerCase(),
    )
  )
    emails.unshift({ email: source.email.toLowerCase(), canSignIn: true });
  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        source,
        target,
        addresses,
        identities,
        profiles,
        counts,
        blockers,
      }),
    )
    .digest("hex");
  const preview: AgentMergePreview = {
    source: personView(source),
    target: personView(target),
    emails,
    identityCount: sourceIdentities.length,
    activityCount: Object.entries(counts)
      .filter(
        ([key]) =>
          !key.includes("agent_email_addresses") &&
          !key.includes("agent_login_identities") &&
          movable.has(key),
      )
      .reduce((sum, [, count]) => sum + count, 0),
    sourceProfiles,
    targetProfiles,
    blockers,
    revision,
  };
  return {
    preview,
    source,
    sourceAddresses,
    sourceIdentities,
    counts,
    references,
  };
}

export async function previewAgentMerge(sourceId: number, targetId: number) {
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { preview } = await inspect(client, sourceId, targetId);
    await client.query("COMMIT");
    return preview;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function mergeAgentAccount(input: {
  actorId: number;
  sourceId: number;
  targetId: number;
  revision: string;
}) {
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    const { rows: locked } = await client.query<Person>(
      `SELECT * FROM portal.agents WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE`,
      [[input.actorId, input.sourceId, input.targetId]],
    );
    const actor = locked.find((row) => row.id === input.actorId);
    if (!actor?.is_admin || actor.account_status !== "active")
      throw new AgentEmailError("FORBIDDEN", 403);
    if (input.sourceId === input.actorId)
      throw new AgentEmailError("MERGE_BLOCKED");
    const {
      rows: [website],
    } = await client.query<{ present: boolean }>(
      `SELECT to_regclass('public.agents') IS NOT NULL AS present`,
    );
    if (website.present)
      await client.query("LOCK TABLE public.agents IN SHARE MODE");
    await client.query(
      `SELECT id FROM portal.agent_email_addresses WHERE agent_id=ANY($1::int[]) ORDER BY id FOR UPDATE`,
      [[input.sourceId, input.targetId]],
    );
    await client.query(
      `SELECT id FROM portal.agent_login_identities WHERE agent_id=ANY($1::int[]) ORDER BY id FOR UPDATE`,
      [[input.sourceId, input.targetId]],
    );
    const {
      preview,
      source,
      sourceAddresses,
      sourceIdentities,
      counts,
      references,
    } = await inspect(client, input.sourceId, input.targetId);
    if (preview.blockers.length) throw new AgentEmailError("MERGE_BLOCKED");
    if (preview.revision !== input.revision)
      throw new AgentEmailError("MERGE_CHANGED");

    await client.query(
      `INSERT INTO portal.agent_merge_history(source_agent_id,target_agent_id,source_email,source_snapshot,moved_references,merged_by_email)
      VALUES($1,$2,$3,$4,$5,$6)`,
      [
        input.sourceId,
        input.targetId,
        source.email,
        JSON.stringify(source),
        JSON.stringify({
          counts,
          emailAddresses: sourceAddresses,
          loginIdentities: sourceIdentities,
        }),
        actor.email,
      ],
    );
    await client.query(
      `UPDATE portal.agent_email_addresses SET agent_id=$2,is_primary=FALSE,updated_at=NOW() WHERE agent_id=$1`,
      [input.sourceId, input.targetId],
    );
    // Preserve disabled and unverified states; a merge is not a reactivation.
    await client.query(
      `INSERT INTO portal.agent_email_addresses(agent_id,email,kind,can_sign_in,is_primary,verified_at,source,created_by_agent_id)
      VALUES($1,$2,'login',TRUE,FALSE,NOW(),'admin_duplicate_merge',$3) ON CONFLICT DO NOTHING`,
      [input.targetId, source.email.toLowerCase(), input.actorId],
    );
    await client.query(
      `UPDATE portal.agent_login_identities SET agent_id=$2,is_primary=FALSE,updated_at=NOW() WHERE agent_id=$1`,
      [input.sourceId, input.targetId],
    );
    for (const ref of references) {
      const key = `${ref.schema_name}.${ref.table_name}.${ref.column_name}`;
      if (
        !counts[key] ||
        !movable.has(key) ||
        [
          "portal.agent_email_addresses.agent_id",
          "portal.agent_login_identities.agent_id",
        ].includes(key)
      )
        continue;
      await client.query(
        `UPDATE ${quote(ref.schema_name)}.${quote(ref.table_name)} SET ${quote(ref.column_name)}=$2 WHERE ${quote(ref.column_name)}=$1`,
        [input.sourceId, input.targetId],
      );
    }
    await client.query(`DELETE FROM portal.agents WHERE id=$1`, [
      input.sourceId,
    ]);
    await client.query(
      `INSERT INTO portal.audit_log(actor_email,action,entity_type,entity_id,summary,detail)
      VALUES($1,'admin_merge_agent','agent',$2,$3,$4)`,
      [
        actor.email,
        String(input.targetId),
        `合并重复账号 #${input.sourceId} → #${input.targetId}`,
        JSON.stringify({
          sourceAgentId: input.sourceId,
          targetAgentId: input.targetId,
          sourceEmail: source.email,
          emails: preview.emails,
          counts,
        }),
      ],
    );
    await client.query("COMMIT");
    return {
      sourceId: input.sourceId,
      targetId: input.targetId,
      emails: preview.emails,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["23505", "23503", "40001", "40P01"].includes(String(error.code))
    )
      throw new AgentEmailError("MERGE_CHANGED");
    throw error;
  } finally {
    client.release();
  }
}
