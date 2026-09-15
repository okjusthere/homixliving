/** Preview first. Applies ONLY administrator-approved, explicitly named profiles. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Client } from "pg";
import { LEGACY_AGENT_CLAIMS_DDL } from "../src/db/legacy-agent-claims";
import { isLegacyGmail } from "../src/lib/legacy-agent-claim-token";
import { isValidLoginEmail } from "../src/lib/email-change";

const option = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const envFile = option("env-file");
if (envFile) process.loadEnvFile(envFile);
const ids = (option("ids") || "").split(",").filter(Boolean).sort();
const actorId = Number(option("actor-id"));
const apply = process.argv.includes("--apply");
assert(ids.length && ids.length <= 100 && new Set(ids).size === ids.length, "Provide distinct --ids=profile-id,...");
assert(Number.isSafeInteger(actorId) && actorId > 0, "Provide --actor-id");
assert(process.env.DATABASE_URL, "DATABASE_URL required");
if (apply) assert(option("snapshot") && option("confirm-hash"), "Apply requires --snapshot and the preview --confirm-hash");
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });

async function main() {
  await client.connect();
  try {
    await client.query(apply ? "BEGIN ISOLATION LEVEL SERIALIZABLE" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='15s'");
    const { rows: [actor] } = await client.query("SELECT id,email FROM portal.agents WHERE id=$1 AND is_admin=TRUE AND account_status='active'", [actorId]);
    assert(actor, "Active administrator required");
    const { rows: profiles } = await client.query(`SELECT * FROM public.agents WHERE id::text=ANY($1::text[]) ORDER BY id${apply ? " FOR UPDATE" : ""}`, [ids]);
    assert.equal(profiles.length, ids.length, "A specified profile no longer exists");
    assert(profiles.every(p => p.portal_agent_id === null), "A specified profile is already linked; review instead of overwriting");
    const normalized = profiles.map(p => ({ id: String(p.id), email: p.email?.trim().toLowerCase() || null }));
    const emails = normalized.map(p => p.email).filter(Boolean);
    assert(emails.every(e => isValidLoginEmail(e)), "Invalid contact email needs administrator review");
    assert.equal(new Set(emails).size, emails.length, "Duplicate contact emails require review");
    const configuredAdminEmails = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map(e => e.trim());
    assert(emails.every(e => !configuredAdminEmails.includes(e)), "Reserved administrator email");
    const { rows: emailConflicts } = await client.query(`SELECT id FROM portal.agents WHERE lower(email)=ANY($1::text[]) OR lower(pending_email)=ANY($1::text[])
      UNION SELECT agent_id FROM portal.agent_email_addresses WHERE lower(email)=ANY($1::text[])
      UNION SELECT agent_id FROM portal.agent_login_identities WHERE lower(email_at_link)=ANY($1::text[])`, [emails]);
    assert.equal(emailConflicts.length, 0, "An email already belongs to an account; resolve explicitly");
    const { rows: licenseConflicts } = await client.query(`SELECT p.id::text AS public_id,a.id AS agent_id FROM public.agents p JOIN portal.agents a ON
      regexp_replace(lower(p.license_number),'[^a-z0-9]','','g')=regexp_replace(lower(a.license_number),'[^a-z0-9]','','g')
      WHERE p.id::text=ANY($1::text[]) AND coalesce(p.license_number,'')<>''`, [ids]);
    assert.equal(licenseConflicts.length, 0, `Existing license ownership requires review: ${JSON.stringify(licenseConflicts)}`);
    const fingerprint = createHash("sha256").update(JSON.stringify({ actor, profiles })).digest("hex");
    const counts = { profiles: profiles.length, emails: emails.length, gmailAutomatic: normalized.filter(p => isLegacyGmail(p.email)).length, invitationOnly: normalized.filter(p => !isLegacyGmail(p.email)).length };
    if (apply) {
      assert.equal(fingerprint, option("confirm-hash"), "Data changed since preview");
      // Write a private, exclusive before-image before any production mutation.
      writeFileSync(option("snapshot")!, JSON.stringify({ at: new Date().toISOString(), actor, fingerprint, profiles }, null, 2), { flag: "wx", mode: 0o600 });
      await client.query(LEGACY_AGENT_CLAIMS_DDL);
      for (const row of normalized) {
        const { rows: [existing] } = await client.query("SELECT expected_email,allow_email_login,revoked_at,claimed_at FROM portal.legacy_agent_claims WHERE public_profile_id=$1 FOR UPDATE", [row.id]);
        if (existing) {
          assert(!existing.revoked_at && !existing.claimed_at && existing.expected_email === row.email && existing.allow_email_login === isLegacyGmail(row.email), "Existing reservation differs; refusing to overwrite");
          continue;
        }
        await client.query(`INSERT INTO portal.legacy_agent_claims(public_profile_id,expected_email,allow_email_login,authorized_by)
          VALUES($1,$2,$3,$4)`, [row.id, row.email, isLegacyGmail(row.email), actorId]);
      }
      await client.query(`INSERT INTO portal.audit_log(actor_email,action,entity_type,entity_id,summary,detail)
        VALUES($1,'legacy_agents_preregistered','legacy_agent_claim','batch',$2,$3)`, [actor.email, `Preregistered ${profiles.length} existing website profiles`, JSON.stringify({ ids, counts, fingerprint, googleVerificationCreated: false })]);
      const { rows: after } = await client.query("SELECT * FROM public.agents WHERE id::text=ANY($1::text[]) ORDER BY id", [ids]);
      assert.deepEqual(after, profiles, "Website profiles must remain byte-for-byte unchanged");
      await client.query("COMMIT");
    } else await client.query("ROLLBACK");
    console.log(JSON.stringify({ mode: apply ? "applied" : "preview", counts, fingerprint, verifiedLoginsCreated: 0, invitationsSent: 0 }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    // Errors contain assertions/codes, never connection credentials or tokens.
    console.error(error instanceof assert.AssertionError ? error.message : (error as { code?: string }).code || "Preregistration failed");
    process.exitCode = 1;
  } finally { await client.end(); }
}
void main();
