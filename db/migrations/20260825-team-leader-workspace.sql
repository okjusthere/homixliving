BEGIN;

ALTER TABLE portal.onboarding_invitations
  ADD COLUMN IF NOT EXISTS team_compensation_config_id INTEGER;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'onboarding_invitations_team_config_fk'
  ) THEN
    ALTER TABLE portal.onboarding_invitations
      ADD CONSTRAINT onboarding_invitations_team_config_fk
      FOREIGN KEY (team_compensation_config_id)
      REFERENCES portal.team_compensation_configs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_onboarding_invites_team_config
  ON portal.onboarding_invitations(team_compensation_config_id);

COMMIT;
