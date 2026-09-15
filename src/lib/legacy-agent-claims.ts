import "server-only";
import type { Pool, PoolClient } from "pg";
import { pgPool } from "@/db";
import { isConfiguredAdminEmail } from "@/lib/admin-emails";
import { isValidLoginEmail, normalizeEmail } from "@/lib/email-change";
import { LEGACY_CLAIM_INVITE_DAYS, createLegacyClaimToken, hashLegacyClaimToken, validLegacyClaimToken } from "./legacy-agent-claim-token";

export class LegacyClaimError extends Error {
  constructor(public code: string) { super(code); }
}

type Claim = {
  public_profile_id: string; expected_email: string | null; allow_email_login: boolean;
  authorized_by: number; token_hash: string | null; token_expires_at: Date | null;
  revoked_at: Date | null; claimed_agent_id: number | null; claimed_email: string | null;
};
type PublicProfile = {
  id: string; name: string; slug: string; phone: string | null;
  license_number: string | null; portal_agent_id: number | null;
};

async function installed(client: PoolClient) {
  const { rows } = await client.query("SELECT to_regclass('portal.legacy_agent_claims') IS NOT NULL AS ready");
  return Boolean(rows[0]?.ready);
}

async function audit(client: PoolClient, actor: string, action: string, publicId: string, detail: object) {
  await client.query(`INSERT INTO portal.audit_log(actor_email,action,entity_type,entity_id,summary,detail)
    VALUES($1,$2,'legacy_agent_claim',$3,$2,$4)`, [actor, action, publicId, JSON.stringify(detail)]);
}

async function currentAdministrator(client: PoolClient, actorId: number) {
  const { rows: [actor] } = await client.query(
    "SELECT email FROM portal.agents WHERE id=$1 AND is_admin=TRUE AND account_status='active' FOR SHARE", [actorId]);
  if (!actor) throw new LegacyClaimError("FORBIDDEN");
  return actor.email as string;
}

/** Read only: link previews/email scanners never consume invitations. */
export async function previewLegacyInvitation(token: string, pool: Pool = pgPool) {
  if (!validLegacyClaimToken(token)) return null;
  const client = await pool.connect();
  try {
    if (!await installed(client)) return null;
    const { rows: [row] } = await client.query<{ name: string; slug: string }>(`
      SELECT p.name,p.slug FROM portal.legacy_agent_claims c JOIN public.agents p ON p.id::text=c.public_profile_id
      WHERE c.token_hash=$1 AND c.token_expires_at>NOW() AND c.revoked_at IS NULL
        AND c.claimed_at IS NULL AND p.portal_agent_id IS NULL`, [hashLegacyClaimToken(token)]);
    return row || null;
  } finally { client.release(); }
}

/**
 * Called ONLY after the OAuth provider has verified email ownership. Serializes
 * on the old profile, and commits identity + account + website link together.
 * No guessed name matching, account merging, agreement completion or fees.
 * The only public.agents write is its association; all display data is retained.
 */
export async function claimLegacyAgent(input: {
  email: string; providerSubject: string; emailVerified: boolean; token?: string;
}, pool: Pool = pgPool): Promise<number | null> {
  if (!input.emailVerified) throw new LegacyClaimError("UNVERIFIED_EMAIL");
  const email = normalizeEmail(input.email);
  if (!email || !isValidLoginEmail(email) || !input.providerSubject.trim()) throw new LegacyClaimError("INVALID_IDENTITY");
  const subject = input.providerSubject.trim();
  if (input.token && !validLegacyClaimToken(input.token)) throw new LegacyClaimError("INVALID_INVITATION");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (!await installed(client)) {
      if (input.token) throw new LegacyClaimError("INVALID_INVITATION");
      await client.query("COMMIT"); return null;
    }
    // A cookie identifies one specific grant. Never fall back to another grant
    // or to the new-agent application if that invitation is invalid.
    const { rows: [candidate] } = await client.query<Claim>(input.token
      ? "SELECT * FROM portal.legacy_agent_claims WHERE token_hash=$1"
      : "SELECT * FROM portal.legacy_agent_claims WHERE expected_email=$1 AND allow_email_login=TRUE",
      [input.token ? hashLegacyClaimToken(input.token) : email]);
    if (!candidate) {
      if (input.token) throw new LegacyClaimError("INVALID_INVITATION");
      await client.query("COMMIT"); return null;
    }
    // Consistent lock order also used by invitation management.
    const { rows: [profile] } = await client.query<PublicProfile>(
      "SELECT id::text,name,slug,phone,license_number,portal_agent_id FROM public.agents WHERE id::text=$1 FOR UPDATE",
      [candidate.public_profile_id]);
    const { rows: [claim] } = await client.query<Claim>(
      "SELECT * FROM portal.legacy_agent_claims WHERE public_profile_id=$1 FOR UPDATE", [candidate.public_profile_id]);
    if (!profile || !claim || claim.revoked_at) throw new LegacyClaimError("CLAIM_UNAVAILABLE");
    if (input.token && (claim.token_hash !== hashLegacyClaimToken(input.token) || !claim.token_expires_at || new Date(claim.token_expires_at).getTime() <= Date.now())) {
      throw new LegacyClaimError("INVALID_INVITATION");
    }
    // OAuth retries are harmless, but a consumed link cannot add another email.
    if (claim.claimed_agent_id) {
      const { rows: [identity] } = await client.query(`SELECT agent_id FROM portal.agent_login_identities
        WHERE provider='google' AND provider_subject=$1 AND disabled_at IS NULL`, [subject]);
      if (profile.portal_agent_id !== claim.claimed_agent_id || (input.token && (claim.claimed_email !== email || identity?.agent_id !== claim.claimed_agent_id))) {
        throw new LegacyClaimError("ALREADY_CLAIMED");
      }
      const { rows: [address] } = await client.query("SELECT agent_id,can_sign_in,verified_at FROM portal.agent_email_addresses WHERE lower(email)=$1", [email]);
      const { rows: disabledIdentities } = await client.query("SELECT 1 FROM portal.agent_login_identities WHERE provider='google' AND provider_subject=$1 AND disabled_at IS NOT NULL", [subject]);
      if (disabledIdentities.length) throw new LegacyClaimError("IDENTITY_CONFLICT");
      if (!input.token && address?.agent_id === claim.claimed_agent_id && address.can_sign_in && address.verified_at) {
        // Already-established logins use normal auth, including later changes
        // to roles/status. A historical grant must not override those controls.
        await client.query("COMMIT"); return null;
      }
      if (address && (!address.can_sign_in || address.agent_id !== claim.claimed_agent_id)) throw new LegacyClaimError("IDENTITY_CONFLICT");
      const { rows: [target] } = await client.query("SELECT id FROM portal.agents WHERE id=$1 AND account_status='active' AND is_admin=FALSE FOR SHARE", [claim.claimed_agent_id]);
      if (!target) throw new LegacyClaimError("CLAIM_UNAVAILABLE");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`agent-email:${email}`]);
      const { rows: conflicts } = await client.query(`SELECT id FROM portal.agents WHERE (lower(email)=$1 OR lower(pending_email)=$1) AND id<>$3
        UNION SELECT agent_id FROM portal.agent_email_addresses WHERE lower(email)=$1 AND agent_id<>$3
        UNION SELECT agent_id FROM portal.agent_login_identities WHERE (lower(email_at_link)=$1 OR (provider='google' AND provider_subject=$2)) AND (agent_id<>$3 OR disabled_at IS NOT NULL)`,
        [email, subject, claim.claimed_agent_id]);
      if (conflicts.length) throw new LegacyClaimError("IDENTITY_CONFLICT");
      // An originally registered Gmail remains an authorized login after the
      // person first claims via a different email. Auth records its Google proof.
      await client.query(`INSERT INTO portal.agent_email_addresses
        (agent_id,email,kind,can_sign_in,is_primary,verified_at,source,created_by_agent_id)
        VALUES($1,$2,'login',TRUE,FALSE,NOW(),'legacy_claim',$3) ON CONFLICT DO NOTHING`, [claim.claimed_agent_id, email, claim.authorized_by]);
      const { rows: [insertedAddress] } = await client.query("SELECT agent_id,can_sign_in,verified_at FROM portal.agent_email_addresses WHERE lower(email)=$1", [email]);
      if (insertedAddress?.agent_id !== claim.claimed_agent_id || !insertedAddress.can_sign_in || !insertedAddress.verified_at) throw new LegacyClaimError("IDENTITY_CONFLICT");
      await client.query(`INSERT INTO portal.agent_login_identities
        (agent_id,provider,provider_subject,email_at_link,is_primary,verified_at,last_used_at,source)
        VALUES($1,'google',$2,$3,FALSE,NOW(),NOW(),'legacy_claim') ON CONFLICT DO NOTHING`, [claim.claimed_agent_id, subject, email]);
      const { rows: [owner] } = await client.query("SELECT agent_id FROM portal.agent_login_identities WHERE provider='google' AND provider_subject=$1 AND disabled_at IS NULL", [subject]);
      if (owner?.agent_id !== claim.claimed_agent_id) throw new LegacyClaimError("IDENTITY_CONFLICT");
      await audit(client, email, "legacy_registered_gmail_verified", profile.id, { agentId: claim.claimed_agent_id });
      await client.query("COMMIT"); return claim.claimed_agent_id;
    }
    if (profile.portal_agent_id) throw new LegacyClaimError("PROFILE_ALREADY_LINKED");
    if (isConfiguredAdminEmail(email)) throw new LegacyClaimError("IDENTITY_CONFLICT");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`agent-email:${email}`]);
    // A previous account/disabled identity is a conflict, never silently moved.
    const { rows: owners } = await client.query(`
      SELECT id FROM portal.agents WHERE lower(email)=$1 OR lower(pending_email)=$1
      UNION SELECT agent_id FROM portal.agent_email_addresses WHERE lower(email)=$1
      UNION SELECT agent_id FROM portal.agent_login_identities
        WHERE lower(email_at_link)=$1 OR (provider='google' AND provider_subject=$2)`, [email, subject]);
    if (owners.length) throw new LegacyClaimError("IDENTITY_CONFLICT");
    const { rows: reservedElsewhere } = await client.query("SELECT 1 FROM portal.legacy_agent_claims WHERE expected_email=$1 AND public_profile_id<>$2", [email, profile.id]);
    if (reservedElsewhere.length) throw new LegacyClaimError("IDENTITY_CONFLICT");
    // Public credentials aid duplicate detection; they are not authentication.
    if (profile.license_number?.trim()) {
      const { rows: duplicates } = await client.query(`SELECT id FROM portal.agents WHERE
        regexp_replace(lower(coalesce(license_number,'')),'[^a-z0-9]','','g')=
        regexp_replace(lower($1::text),'[^a-z0-9]','','g')`, [profile.license_number]);
      if (duplicates.length) throw new LegacyClaimError("LICENSE_CONFLICT");
    }
    const { rows: [person] } = await client.query<{ id: number }>(`
      INSERT INTO portal.agents(name,email,phone,license_number,is_admin,account_status,onboarding_source,onboarding_website_sync,licensed_company_id,licensed_company,created_at,updated_at)
      VALUES($1,$2,$3,$4,FALSE,'active','legacy_claim',$5::jsonb,'homix_realty','Homix Realty Inc.',NOW(),NOW()) RETURNING id`,
      [profile.name, email, profile.phone, profile.license_number, JSON.stringify({ status: "complete", attemptedAt: new Date().toISOString() })]);
    await client.query(`INSERT INTO portal.agent_email_addresses
      (agent_id,email,kind,can_sign_in,is_primary,verified_at,source,created_by_agent_id)
      VALUES($1,$2,'login',TRUE,TRUE,NOW(),'legacy_claim',$3)`, [person.id, email, claim.authorized_by]);
    await client.query(`INSERT INTO portal.agent_login_identities
      (agent_id,provider,provider_subject,email_at_link,is_primary,verified_at,last_used_at,source)
      VALUES($1,'google',$2,$3,TRUE,NOW(),NOW(),'legacy_claim')`, [person.id, subject, email]);
    await client.query("UPDATE public.agents SET portal_agent_id=$1 WHERE id::text=$2 AND portal_agent_id IS NULL", [person.id, profile.id]);
    await client.query(`UPDATE portal.legacy_agent_claims SET claimed_agent_id=$1,claimed_email=$2,claimed_at=NOW()
      WHERE public_profile_id=$3`, [person.id, email, profile.id]);
    await audit(client, email, "legacy_agent_claimed", profile.id, {
      agentId: person.id, method: input.token ? "personal_invitation" : "registered_gmail",
      authorizedBy: claim.authorized_by, originalSlug: profile.slug,
      agreementsUnchanged: true, websiteDisplayUnchanged: true,
    });
    await client.query("COMMIT");
    return person.id;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error && typeof error === "object" && "code" in error && error.code === "23505") throw new LegacyClaimError("IDENTITY_CONFLICT");
    throw error;
  } finally { client.release(); }
}

export async function manageLegacyInvitation(input: { publicId: string; actorId: number; revoke: boolean }, pool: Pool = pgPool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const actorEmail = await currentAdministrator(client, input.actorId);
    const { rows: [profile] } = await client.query("SELECT portal_agent_id FROM public.agents WHERE id::text=$1 FOR UPDATE", [input.publicId]);
    const { rows: [claim] } = await client.query<Claim>("SELECT * FROM portal.legacy_agent_claims WHERE public_profile_id=$1 FOR UPDATE", [input.publicId]);
    if (!profile || !claim || profile.portal_agent_id || claim.claimed_agent_id) throw new LegacyClaimError("CLAIM_UNAVAILABLE");
    const token = input.revoke ? null : createLegacyClaimToken();
    if (input.revoke) {
      // Revocation closes BOTH the bearer invitation and automatic email claim.
      await client.query("UPDATE portal.legacy_agent_claims SET revoked_at=NOW(),token_hash=NULL,token_expires_at=NULL WHERE public_profile_id=$1", [input.publicId]);
    } else {
      if (claim.revoked_at) throw new LegacyClaimError("CLAIM_REVOKED");
      await client.query(`UPDATE portal.legacy_agent_claims SET token_hash=$1,
        token_issued_at=NOW(),token_expires_at=NOW()+($2*INTERVAL '1 day') WHERE public_profile_id=$3`,
        [hashLegacyClaimToken(token!), LEGACY_CLAIM_INVITE_DAYS, input.publicId]);
    }
    await audit(client, actorEmail, input.revoke ? "legacy_claim_revoked" : "legacy_claim_invitation_issued", input.publicId, { days: LEGACY_CLAIM_INVITE_DAYS });
    await client.query("COMMIT"); return token;
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}

/** All Portal publishing entry points must resolve existing licensed profiles. */
export async function hasReservedLegacyProfile(license: string | null | undefined, agentId?: number, pool: Pool = pgPool) {
  if (!license?.trim()) return false;
  const client = await pool.connect();
  try {
    if (!await installed(client)) return false;
    const { rows } = await client.query(`SELECT 1 FROM public.agents p
      JOIN portal.legacy_agent_claims c ON c.public_profile_id=p.id::text
      WHERE (p.portal_agent_id IS NULL OR p.portal_agent_id IS DISTINCT FROM $2::integer)
        AND regexp_replace(lower(coalesce(p.license_number,'')),'[^a-z0-9]','','g')=
          regexp_replace(lower($1::text),'[^a-z0-9]','','g') LIMIT 1`, [license, agentId ?? null]);
    return rows.length > 0;
  } finally { client.release(); }
}
