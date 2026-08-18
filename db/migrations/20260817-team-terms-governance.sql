BEGIN;

ALTER TABLE portal.team_compensation_configs
  DROP CONSTRAINT IF EXISTS team_compensation_configs_default_team_split_pct_check,
  DROP CONSTRAINT IF EXISTS team_compensation_configs_team_lead_split_pct_check;

ALTER TABLE portal.team_compensation_configs
  ADD CONSTRAINT team_compensation_configs_default_team_split_pct_check
    CHECK (default_team_split_pct IN (10, 15, 20)),
  ADD CONSTRAINT team_compensation_configs_team_lead_split_pct_check
    CHECK (team_lead_split_pct IN (10, 15, 20, 25, 30));

ALTER TABLE portal.agents
  ADD COLUMN IF NOT EXISTS team_terms_config_id INTEGER,
  ADD COLUMN IF NOT EXISTS team_terms_effective_from DATE,
  ADD COLUMN IF NOT EXISTS team_terms_accepted_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agents_team_terms_config_fk'
  ) THEN
    ALTER TABLE portal.agents
      ADD CONSTRAINT agents_team_terms_config_fk
      FOREIGN KEY (team_terms_config_id)
      REFERENCES portal.team_compensation_configs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agents_team_terms_config
  ON portal.agents(team_terms_config_id);

-- Preserve the terms existing members have when this migration is applied.
-- The application moves them to later versions only when their next
-- anniversary cycle begins.
UPDATE portal.agents AS agent
SET team_terms_config_id = (
      SELECT config.id
      FROM portal.team_compensation_configs AS config
      WHERE config.team_id = agent.team_id
        AND config.effective_from <= CURRENT_DATE
      ORDER BY config.effective_from DESC, config.version DESC
      LIMIT 1
    ),
    team_terms_effective_from = CURRENT_DATE,
    team_terms_accepted_at = NOW()
WHERE agent.plan = 'team_member'
  AND agent.team_id IS NOT NULL
  AND agent.team_terms_config_id IS NULL;

COMMIT;
