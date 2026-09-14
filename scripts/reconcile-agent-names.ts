/** Reviewed, all-or-nothing identity correction. Dry-run unless --apply is explicit. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import { matchMlsIdentity, mlsLegalName, type MlsIdentityMember } from "../src/lib/agent-mls-identity";
import { validAgentName, websiteAgentName } from "../src/lib/agent-names";

const name = z.string().refine(validAgentName);
const license = z.string().regex(/^\d{11}$/);
const proof = z.object({ memberKey: z.string(), memberMlsId: z.string(), fullName: name, firstName: name, lastName: name, legalName: name, stateLicense: license });
const before = z.object({ name: z.string(), license_number: z.string().nullable(), updated_at: z.string(), protected_hash: z.string().regex(/^[a-f0-9]{32}$/) });
export const reconciliationPlanSchema = z.object({
  version: z.literal(1), createdAt: z.iso.datetime(), sourceRetrievedAt: z.iso.datetime(),
  portal: z.array(z.object({ id: z.number().int().positive(), before: before.extend({ legal_name: z.string().nullable() }), after: z.object({ name, legal_name: name, license_number: license }), mls: proof, reason: z.string() })),
  public: z.array(z.object({ id: z.string().min(1), slug: z.string(), before: before.extend({ portal_agent_id: z.number().nullable(), mls_id: z.string().nullable() }), after: z.object({ name, license_number: license }), mls: proof, reason: z.string() })),
});
export type ReconciliationPlan = z.infer<typeof reconciliationPlanSchema>;

export const portalProjection = `a.id,a.name,a.legal_name,a.license_number,a.updated_at,a.account_status,a.agreement_status,
  a.signing_request_id,a.signing_preparation,a.onboarding_manual_contract,a.esign_envelope_id,a.esign_transaction_id,
  ARRAY(select lower(e.email) from portal.agent_email_addresses e where e.agent_id=a.id and e.can_sign_in and e.verified_at is not null) as verified_emails,
  md5((to_jsonb(a)-'name'-'legal_name'-'license_number'-'updated_at')::text) as protected_hash`;
export const publicProjection = `a.id,a.slug,a.name,a.license_number,a.mls_id,a.portal_agent_id,a.updated_at,
  md5((to_jsonb(a)-'name'-'license_number'-'updated_at')::text) as protected_hash`;
const timestamp = (value: unknown) => (value instanceof Date ? value : new Date(String(value))).toISOString();
function assertBefore(actual: Record<string, unknown> | undefined, expected: Record<string, unknown>, label: string) {
  if (!actual) throw new Error(`${label}: missing row`);
  for (const [key, value] of Object.entries(expected)) {
    const same = key === "updated_at" ? timestamp(actual[key]) === timestamp(value) : actual[key] === value;
    if (!same) throw new Error(`${label}: stale ${key}; rebuild and review the plan`);
  }
}
function assertProof(expected: z.infer<typeof proof>, members: MlsIdentityMember[]) {
  const matches = members.filter(m => m.memberMlsId === expected.memberMlsId);
  if (matches.length !== 1) throw new Error("MLS identity missing or ambiguous");
  const member = matches[0];
  for (const key of ["memberKey", "fullName", "firstName", "lastName", "stateLicense"] as const) {
    if (member[key] !== expected[key]) throw new Error(`MLS source changed: ${key}`);
  }
  if (mlsLegalName(member) !== expected.legalName) throw new Error("MLS legal-name derivation changed");
}
function assertUniqueIds(rows: { id: number | string }[]) {
  if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error("Duplicate row in reviewed plan");
}

/** Caller supplies freshly fetched MLS evidence; test callers use only synthetic data. */
export async function reconcileAgentNames(client: PoolClient, input: unknown, members: MlsIdentityMember[], batchHash: string, apply = false) {
  const plan = reconciliationPlanSchema.parse(input);
  if (!/^[a-f0-9]{64}$/.test(batchHash)) throw new Error("Invalid reviewed plan hash");
  assertUniqueIds(plan.portal); assertUniqueIds(plan.public);
  const now = Date.now(), sourceTime = Date.parse(plan.sourceRetrievedAt);
  if (now - sourceTime > 86400000 || sourceTime > now + 60000) throw new Error("Source snapshot must be less than 24 hours old");
  for (const row of [...plan.portal, ...plan.public]) assertProof(row.mls, members);
  await client.query(apply ? "BEGIN ISOLATION LEVEL SERIALIZABLE" : "BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout='20s'");
    await client.query("SET LOCAL lock_timeout='5s'");
    if (apply) await client.query("SELECT pg_advisory_xact_lock(184132, 1)");
    const portalIds = [...new Set([...plan.portal.map(r => r.id), ...plan.public.flatMap(r => r.before.portal_agent_id ? [r.before.portal_agent_id] : [])])];
    const portalRows = (await client.query(`SELECT ${portalProjection} FROM portal.agents a WHERE a.id=ANY($1::int[]) ORDER BY a.id ${apply ? "FOR UPDATE OF a" : ""}`, [portalIds])).rows;
    const publicRows = (await client.query(`SELECT ${publicProjection} FROM public.agents a WHERE a.id=ANY($1::text[]) OR a.portal_agent_id=ANY($2::int[]) ORDER BY a.id ${apply ? "FOR UPDATE OF a" : ""}`, [plan.public.map(r => r.id), portalIds])).rows;
    for (const row of plan.portal) {
      const current = portalRows.find(p => p.id === row.id);
      assertBefore(current, row.before, `Portal #${row.id}`);
      if (current.signing_request_id || current.signing_preparation || current.onboarding_manual_contract || current.esign_envelope_id || current.esign_transaction_id ||
          !["active", "pending"].includes(current.account_status) || !["completed", "not_started"].includes(current.agreement_status)) throw new Error(`Portal #${row.id}: signing/access review required`);
      const linked = publicRows.filter(q => q.portal_agent_id === row.id);
      if (linked.length > 1) throw new Error("Multiple public profiles; resolve links separately");
      const match = matchMlsIdentity({ mlsId: linked[0]?.mls_id, portalLicense: current.license_number, publicLicense: linked[0]?.license_number, verifiedEmails: current.verified_emails }, members);
      if (match.member?.memberMlsId !== row.mls.memberMlsId) throw new Error(`Portal #${row.id}: identity evidence changed`);
      if (row.after.legal_name !== row.mls.legalName || row.after.license_number !== row.mls.stateLicense) throw new Error("Planned legal identity differs from MLS");
    }
    for (const row of plan.public) {
      const current = publicRows.find(q => q.id === row.id);
      assertBefore(current, { ...row.before, slug: row.slug }, `Public #${row.id}`);
      const linked = portalRows.find(p => p.id === row.before.portal_agent_id);
      if (row.before.portal_agent_id && !linked) throw new Error("Missing linked Portal account");
      const match = matchMlsIdentity({ mlsId: current.mls_id, portalLicense: linked?.license_number, publicLicense: current.license_number, verifiedEmails: linked?.verified_emails }, members);
      if (match.member?.memberMlsId !== row.mls.memberMlsId || row.after.license_number !== row.mls.stateLicense) throw new Error(`Public #${row.id}: identity evidence changed`);
      if (linked) {
        const target = plan.portal.find(p => p.id === linked.id)?.after ?? linked;
        if (target.legal_name !== row.mls.legalName || row.after.name !== websiteAgentName({ name: target.name, legalName: target.legal_name })) throw new Error("Website label differs from canonical Portal identity");
      }
    }
    const receipt = { batchHash, applied: apply, checkedAt: new Date().toISOString(), portal: plan.portal.length, public: plan.public.length };
    if (!apply) { await client.query("ROLLBACK"); return receipt; }
    for (const row of plan.portal) {
      const result = await client.query(`UPDATE portal.agents a SET name=$2,legal_name=$3,license_number=$4,updated_at=now() WHERE id=$1 RETURNING ${portalProjection}`, [row.id, row.after.name, row.after.legal_name, row.after.license_number]);
      assertBefore(result.rows[0], { ...row.after, protected_hash: row.before.protected_hash }, `Updated Portal #${row.id}`);
      await audit(client, "agent", row, batchHash, plan.sourceRetrievedAt);
    }
    for (const row of plan.public) {
      const result = await client.query(`UPDATE public.agents a SET name=$2,license_number=$3,updated_at=now() WHERE id=$1 RETURNING ${publicProjection}`, [row.id, row.after.name, row.after.license_number]);
      assertBefore(result.rows[0], { ...row.after, protected_hash: row.before.protected_hash }, `Updated Public #${row.id}`);
      await audit(client, "public_agent", row, batchHash, plan.sourceRetrievedAt);
    }
    await client.query("COMMIT");
    return receipt;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

async function audit(client: PoolClient, entityType: string, row: ReconciliationPlan["portal"][number] | ReconciliationPlan["public"][number], batchHash: string, sourceRetrievedAt: string) {
  // Strict, same-transaction audit: unlike interactive best-effort audit, failure aborts the batch.
  await client.query(`INSERT INTO portal.audit_log(action,entity_type,entity_id,summary,detail,created_at) VALUES('reconcile_mls_identity',$1,$2,$3,$4,now())`, [entityType, String(row.id), "Office-authorized MLS legal identity and preferred-name reconciliation", JSON.stringify({ batchHash, sourceRetrievedAt, before: row.before, after: row.after, mls: row.mls, reason: row.reason })]);
}

export function databaseFingerprint(connectionString: string) {
  const url = new URL(connectionString);
  return createHash("sha256").update(`${url.hostname}:${url.port}/${url.pathname}/${url.username}`).digest("hex");
}
async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const path = value("--plan"), apply = args.includes("--apply"), receiptPath = value("--receipt");
  if (!path || !receiptPath) throw new Error("Require --plan <private JSON> --receipt <new private JSON>; dry-run by default");
  const raw = readFileSync(path, "utf8"), batchHash = createHash("sha256").update(raw).digest("hex");
  const plan = reconciliationPlanSchema.parse(JSON.parse(raw));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const target = databaseFingerprint(connectionString);
  const url = new URL(connectionString);
  if (!url.hostname.endsWith(".pooler.supabase.com")) throw new Error("CLI requires the configured Supabase pooler");
  if (apply && (value("--confirm-plan-sha256") !== batchHash || value("--confirm-database") !== target)) throw new Error("Apply requires the exact reviewed plan SHA256 and dry-run database fingerprint");
  const api = new URL("/api/v1/agents/roster", process.env.BBO_API_URL || "https://onekey.kevv.ai");
  if (api.origin !== "https://onekey.kevv.ai" || !process.env.BBO_API_KEY) throw new Error("Configured BBO authority/key required");
  const response = await fetch(api, { headers: { Authorization: `Bearer ${process.env.BBO_API_KEY}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`MLS source HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.members)) throw new Error("Missing MLS roster");
  // Reserve a private receipt before any mutation. No overwrite of earlier evidence.
  writeFileSync(receiptPath, JSON.stringify({ status: "started", apply, batchHash, databaseFingerprint: target, before: plan }, null, 2), { mode: 0o600, flag: "wx" });
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });
  try {
    const client = await pool.connect();
    try {
      const receipt = { ...await reconcileAgentNames(client, plan, payload.members, batchHash, apply), databaseFingerprint: target };
      writeFileSync(receiptPath, JSON.stringify({ status: "complete", ...receipt, reviewedPlan: plan }, null, 2), { mode: 0o600 });
      console.log(JSON.stringify(receipt));
    } finally { client.release(); }
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error instanceof Error ? error.message : "Identity reconciliation failed"); process.exitCode = 1; });
