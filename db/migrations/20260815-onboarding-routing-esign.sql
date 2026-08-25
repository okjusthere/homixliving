ALTER TABLE portal.agents
  ADD COLUMN IF NOT EXISTS esign_template_version_id TEXT,
  ADD COLUMN IF NOT EXISTS esign_evidence_package_id TEXT,
  ADD COLUMN IF NOT EXISTS agreement_completed_at TIMESTAMPTZ;

ALTER TABLE portal.onboarding_invitations
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS lock_plan BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS lock_team BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS lock_sponsor BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS lock_term BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN portal.onboarding_invitations.kind IS
  'personal_referral, team_recruiting, or admin';
