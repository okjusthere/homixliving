import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { portalProjection, publicProjection, reconcileAgentNames } from "../../../scripts/reconcile-agent-names";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/homix_identity_reconciliation", "Only isolated local identity test DB allowed");
  const pool = new Pool({ connectionString: url.toString(), max: 1 });
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS public.agents(id text PRIMARY KEY,slug text NOT NULL,name text NOT NULL,license_number text,mls_id text,portal_agent_id int,updated_at timestamptz DEFAULT now(),photo_url text,visibility_status text)`);
    const email = `${randomUUID()}@example.invalid`, key = `KEY${randomUUID()}`;
    const member = { memberKey: key, memberMlsId: key, fullName: "Jiaer Xia", firstName: "Jiaer", lastName: "Xia", stateLicense: "10401999999", email };
    const id = (await client.query(`INSERT INTO portal.agents(name,email,account_status,agreement_status,updated_at) VALUES('Grace',$1,'active','completed',now()) RETURNING id`, [email])).rows[0].id;
    await client.query(`INSERT INTO portal.agent_email_addresses(agent_id,email,can_sign_in,is_primary,verified_at) VALUES($1,$2,true,true,now())`, [id, email]);
    const publicId = (await client.query(`INSERT INTO public.agents(id,slug,name,portal_agent_id,mls_id,photo_url,visibility_status) VALUES($1,$1,'Grace Xia',$2,$3,'preserve-photo','public') RETURNING id`, [randomUUID(), id, key])).rows[0].id;
    const currentPortal = async () => (await client.query(`SELECT ${portalProjection} FROM portal.agents a WHERE id=$1`, [id])).rows[0];
    const currentPublic = async () => (await client.query(`SELECT ${publicProjection} FROM public.agents a WHERE id=$1`, [publicId])).rows[0];
    const p = await currentPortal(), q = await currentPublic();
    const mls = { ...member, legalName: "Jiaer Xia" };
    const plan = JSON.parse(JSON.stringify({ version: 1, createdAt: new Date().toISOString(), sourceRetrievedAt: new Date().toISOString(), portal: [{ id, before: p, after: { name: "Grace Xia", legal_name: "Jiaer Xia", license_number: member.stateLicense }, mls, reason: "EXPLICIT_MLS_ID" }], public: [{ id: publicId, slug: q.slug, before: q, after: { name: "Jiaer Xia (Grace)", license_number: member.stateLicense }, mls, reason: "EXPLICIT_MLS_ID" }] }));
    const hash = "1".repeat(64);
    const audits = async () => Number((await client.query(`SELECT count(*) FROM portal.audit_log WHERE action='reconcile_mls_identity' AND entity_id=$1 AND entity_type='agent'`, [String(id)])).rows[0].count);
    assert.equal((await reconcileAgentNames(client, plan, [member], hash)).applied, false);
    assert.equal((await currentPortal()).legal_name, null);
    assert.equal(await audits(), 0);
    await assert.rejects(reconcileAgentNames(client, plan, [{ ...member, stateLicense: "10401888888" }], hash, true), /source changed/);
    const stale = structuredClone(plan); stale.public[0].before.name = "Stale";
    await assert.rejects(reconcileAgentNames(client, stale, [member], hash, true), /stale name/);
    assert.equal((await currentPortal()).legal_name, null, "public-row mismatch must roll back entire batch");
    await client.query(`UPDATE portal.agents SET signing_request_id=$2 WHERE id=$1`, [id, randomUUID()]);
    const signed = structuredClone(plan); signed.portal[0].before.protected_hash = (await currentPortal()).protected_hash;
    await assert.rejects(reconcileAgentNames(client, signed, [member], hash, true), /signing\/access review/);
    await client.query(`UPDATE portal.agents SET signing_request_id=null WHERE id=$1`, [id]);
    assert.equal((await reconcileAgentNames(client, plan, [member], hash, true)).applied, true);
    assert.equal((await currentPortal()).legal_name, "Jiaer Xia");
    assert.equal((await currentPortal()).protected_hash, p.protected_hash);
    assert.equal((await currentPublic()).name, "Jiaer Xia (Grace)");
    assert.equal((await currentPublic()).protected_hash, q.protected_hash);
    assert.equal(await audits(), 1);
    await assert.rejects(reconcileAgentNames(client, plan, [member], hash, true), /stale/);
    assert.equal(await audits(), 1, "replay must not duplicate mutation/audit");
    console.log("PASS: reviewed MLS reconciliation dry-run, source/stale/signed guards, atomic apply, unchanged protected fields, strict audit and replay rejection");
  } finally { client.release(); await pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
