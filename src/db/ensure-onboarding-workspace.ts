import type { Sql } from "postgres";

// Keep in sync with db/migrations/20260912-signing-onboarding-workspaces.sql.
export async function ensureOnboardingWorkspace(sql: Sql) {
  await sql.unsafe(`-- Additive; no existing contract/account data is migrated or deleted.
ALTER TABLE portal.agents ADD COLUMN IF NOT EXISTS onboarding_manual_contract JSONB;
ALTER TABLE portal.agents ADD COLUMN IF NOT EXISTS onboarding_fee_adjustment JSONB;
ALTER TABLE portal.agents ADD COLUMN IF NOT EXISTS onboarding_website_sync JSONB;
ALTER TABLE portal.agents ADD COLUMN IF NOT EXISTS onboarding_disposition JSONB;
ALTER TABLE portal.agents ADD COLUMN IF NOT EXISTS signing_request_id UUID;
ALTER TABLE portal.agents ADD COLUMN IF NOT EXISTS onboarding_signing_closure JSONB;
ALTER TABLE portal.agents ADD COLUMN IF NOT EXISTS signing_preparation JSONB;
ALTER TABLE portal.team_leader_applications ADD COLUMN IF NOT EXISTS signing_request_id UUID;
ALTER TABLE portal.team_leader_applications ADD COLUMN IF NOT EXISTS signing_preparation JSONB;
CREATE TABLE IF NOT EXISTS portal.onboarding_contracts (
 id UUID PRIMARY KEY, agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
 source TEXT NOT NULL CHECK(source IN ('paper','historic')), company TEXT NOT NULL,
 title TEXT NOT NULL, version TEXT NOT NULL, purpose TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, sha256 TEXT NOT NULL, byte_size INTEGER NOT NULL CHECK(byte_size > 0),
 agent_signed_at TIMESTAMPTZ NOT NULL, company_signed_at TIMESTAMPTZ,
 replaces_id UUID REFERENCES portal.onboarding_contracts(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','accepted','returned','revoked','superseded')),
 uploaded_by INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
 reviewed_by INTEGER REFERENCES portal.agents(id) ON DELETE RESTRICT, reviewed_at TIMESTAMPTZ, review_reason TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_contracts_agent ON portal.onboarding_contracts(agent_id, created_at);
CREATE TABLE IF NOT EXISTS portal.onboarding_receipts (
 id UUID PRIMARY KEY, agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
 idempotency_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL, reference_key TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), currency TEXT NOT NULL DEFAULT 'usd' CHECK(currency = 'usd'),
 method TEXT NOT NULL CHECK(method IN ('cash','check','ach','zelle','wire','other')), reference TEXT NOT NULL,
 received_at TIMESTAMPTZ NOT NULL, recorded_by INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'unmatched' CHECK(status IN ('unmatched','matched','voided')),
 order_id INTEGER REFERENCES portal.commerce_orders(id) ON DELETE RESTRICT, reason TEXT, matched_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK ((status = 'matched') = (order_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_receipts_reference ON portal.onboarding_receipts(reference_key) WHERE status <> 'voided';
CREATE INDEX IF NOT EXISTS idx_onboarding_receipts_agent ON portal.onboarding_receipts(agent_id, status);
CREATE TABLE IF NOT EXISTS portal.onboarding_access_grants (
 id UUID PRIMARY KEY, agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
 capabilities JSONB NOT NULL CHECK(jsonb_typeof(capabilities) = 'array' AND jsonb_array_length(capabilities) > 0 AND capabilities <@ '["profile","training","resources"]'::jsonb),
 reason TEXT NOT NULL, outstanding_requirements TEXT NOT NULL,
 responsible_agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
 expires_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','revoked','completed')),
 granted_by INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
 ended_by INTEGER REFERENCES portal.agents(id) ON DELETE RESTRICT, ended_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_onboarding_grants_agent ON portal.onboarding_access_grants(agent_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_grants_open ON portal.onboarding_access_grants(agent_id) WHERE status = 'open';
CREATE TABLE IF NOT EXISTS portal.onboarding_existing_staff (
 id UUID PRIMARY KEY, agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
 contract_id UUID NOT NULL REFERENCES portal.onboarding_contracts(id) ON DELETE RESTRICT,
 reason TEXT NOT NULL, billing_basis TEXT NOT NULL CHECK(billing_basis IN ('not_applicable','historically_verified','current_payment')),
 billing_evidence TEXT NOT NULL, recognized_by INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_existing_staff_agent ON portal.onboarding_existing_staff(agent_id);

CREATE TABLE IF NOT EXISTS portal.signing_event_inbox (
 id UUID PRIMARY KEY, request_id UUID NOT NULL, owner_agent_id INTEGER NOT NULL,
 scenario TEXT NOT NULL CHECK(scenario IN ('onboarding','team_leader')),
 received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), processed_at TIMESTAMPTZ, lease_until TIMESTAMPTZ,
 attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT
);

-- Server-only HR data. The Portal database role owns these tables and handles
-- authorization; no browser/Data API role receives a policy or table grant.
ALTER TABLE portal.onboarding_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.onboarding_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.onboarding_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.onboarding_existing_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.signing_event_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal.onboarding_contracts, portal.onboarding_receipts, portal.onboarding_access_grants, portal.onboarding_existing_staff, portal.signing_event_inbox FROM PUBLIC;
DO $permissions$
DECLARE browser_role TEXT;
BEGIN
 FOR browser_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  EXECUTE format('REVOKE ALL ON TABLE portal.onboarding_contracts, portal.onboarding_receipts, portal.onboarding_access_grants, portal.onboarding_existing_staff, portal.signing_event_inbox FROM %I', browser_role);
 END LOOP;
END $permissions$;
`);
}
