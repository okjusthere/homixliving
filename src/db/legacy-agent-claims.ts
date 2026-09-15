import type { Sql } from "postgres";

// Additive rollout, deliberately separate from account/email backfills. A
// reservation is an administrator's access grant, NOT a verified Google login.
export const LEGACY_AGENT_CLAIMS_DDL = `
CREATE TABLE IF NOT EXISTS portal.legacy_agent_claims (
  public_profile_id TEXT PRIMARY KEY,
  expected_email TEXT,
  allow_email_login BOOLEAN NOT NULL DEFAULT FALSE,
  authorized_by INTEGER NOT NULL REFERENCES portal.agents(id),
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  token_hash TEXT UNIQUE,
  token_expires_at TIMESTAMPTZ,
  token_issued_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  claimed_agent_id INTEGER REFERENCES portal.agents(id),
  claimed_email TEXT,
  claimed_at TIMESTAMPTZ,
  CHECK (expected_email IS NULL OR expected_email = lower(trim(expected_email))),
  CHECK (NOT allow_email_login OR expected_email LIKE '%@gmail.com'),
  CHECK ((claimed_at IS NULL) = (claimed_agent_id IS NULL)),
  CHECK ((claimed_at IS NULL) = (claimed_email IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_legacy_agent_claim_email
  ON portal.legacy_agent_claims(expected_email) WHERE expected_email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_legacy_agent_claim_person
  ON portal.legacy_agent_claims(claimed_agent_id) WHERE claimed_agent_id IS NOT NULL;
ALTER TABLE portal.legacy_agent_claims ENABLE ROW LEVEL SECURITY;
`;

export async function ensureLegacyAgentClaimsSchema(sql: Sql) {
  await sql.unsafe(LEGACY_AGENT_CLAIMS_DDL);
}
