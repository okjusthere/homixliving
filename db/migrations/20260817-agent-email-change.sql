BEGIN;

ALTER TABLE portal.agents
  ADD COLUMN IF NOT EXISTS pending_email TEXT,
  ADD COLUMN IF NOT EXISTS email_change_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_change_token_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agents_pending_email_lower
  ON portal.agents(lower(pending_email))
  WHERE pending_email IS NOT NULL;

COMMIT;
