BEGIN;

CREATE TABLE IF NOT EXISTS portal.licensed_companies (
  id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL,
  broker_name TEXT NOT NULL,
  broker_title TEXT NOT NULL,
  broker_email TEXT NOT NULL,
  requires_libor_onekey BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT licensed_companies_id_check CHECK (id IN ('homix_realty','homix_living'))
);

INSERT INTO portal.licensed_companies (
  id, legal_name, address, broker_name, broker_title, broker_email,
  requires_libor_onekey, is_active
) VALUES
  ('homix_realty', 'Homix Realty Inc.', '37-20 Prince St, STE 3H, Flushing, NY 11354',
   'Si Zhang', 'Broker', 'sunnyz@homixny.com', TRUE, TRUE),
  ('homix_living', 'Homix Living Inc.', '110 Charlton St #A, New York, NY 10014',
   'Si Zhang', 'Broker', 'sunnyz@homixny.com', FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET
  legal_name = EXCLUDED.legal_name,
  address = EXCLUDED.address,
  broker_name = EXCLUDED.broker_name,
  broker_title = EXCLUDED.broker_title,
  broker_email = EXCLUDED.broker_email,
  requires_libor_onekey = EXCLUDED.requires_libor_onekey,
  is_active = EXCLUDED.is_active;

ALTER TABLE portal.agents
  ADD COLUMN IF NOT EXISTS licensed_company_id TEXT,
  ADD COLUMN IF NOT EXISTS company_selected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS company_requirements_acknowledged_at TIMESTAMPTZ;
ALTER TABLE portal.teams
  ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE portal.onboarding_invitations
  ADD COLUMN IF NOT EXISTS company_id TEXT,
  ADD COLUMN IF NOT EXISTS lock_company BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE portal.team_leader_applications
  ADD COLUMN IF NOT EXISTS company_id TEXT;

UPDATE portal.agents SET licensed_company_id = CASE
  WHEN lower(regexp_replace(coalesce(licensed_company, ''), '[^a-zA-Z0-9]+', ' ', 'g')) LIKE '%homix realty%' THEN 'homix_realty'
  WHEN lower(regexp_replace(coalesce(licensed_company, ''), '[^a-zA-Z0-9]+', ' ', 'g')) LIKE '%homix living%' THEN 'homix_living'
  ELSE licensed_company_id
END
WHERE licensed_company_id IS NULL;

UPDATE portal.agents
SET company_selected_at = coalesce(company_selected_at, updated_at, created_at, NOW()),
    company_requirements_acknowledged_at = coalesce(
      company_requirements_acknowledged_at, updated_at, created_at, NOW()
    )
WHERE licensed_company_id IS NOT NULL;

UPDATE portal.teams AS team
SET company_id = leader.licensed_company_id
FROM portal.agents AS leader
WHERE team.leader_agent_id = leader.id
  AND team.company_id IS NULL;

UPDATE portal.team_leader_applications AS application
SET company_id = applicant.licensed_company_id
FROM portal.agents AS applicant
WHERE application.applicant_agent_id = applicant.id
  AND application.company_id IS NULL;

UPDATE portal.onboarding_invitations AS invitation
SET company_id = team.company_id,
    lock_company = TRUE
FROM portal.teams AS team
WHERE invitation.team_id = team.id
  AND invitation.company_id IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agents_licensed_company_id_fk') THEN
    ALTER TABLE portal.agents ADD CONSTRAINT agents_licensed_company_id_fk
      FOREIGN KEY (licensed_company_id) REFERENCES portal.licensed_companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teams_company_id_fk') THEN
    ALTER TABLE portal.teams ADD CONSTRAINT teams_company_id_fk
      FOREIGN KEY (company_id) REFERENCES portal.licensed_companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'onboarding_invitations_company_id_fk') THEN
    ALTER TABLE portal.onboarding_invitations ADD CONSTRAINT onboarding_invitations_company_id_fk
      FOREIGN KEY (company_id) REFERENCES portal.licensed_companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_leader_applications_company_id_fk') THEN
    ALTER TABLE portal.team_leader_applications ADD CONSTRAINT team_leader_applications_company_id_fk
      FOREIGN KEY (company_id) REFERENCES portal.licensed_companies(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agents_licensed_company_id
  ON portal.agents(licensed_company_id);
CREATE INDEX IF NOT EXISTS idx_teams_company_id
  ON portal.teams(company_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_invitations_company_id
  ON portal.onboarding_invitations(company_id);

COMMIT;
