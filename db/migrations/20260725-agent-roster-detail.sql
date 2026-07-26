-- Roster detail for the admin agent list. Apply BEFORE deploying the code that
-- reads these columns; both are nullable and additive, so older application
-- versions keep working after it runs.
--
--   legal_name            the name on the licence / tax forms, which often
--                         differs from the display name Google supplies
--                         (e.g. "Zhengle Wei (Eric)").
--   referred_by_agent_id  which existing agent recruited this one. Always set
--                         by an administrator by hand — never inferred.
--                         ON DELETE SET NULL so removing a referrer's row can't
--                         erase the recruit's record.

BEGIN;

ALTER TABLE portal.agents
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS referred_by_agent_id INTEGER;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agents_referred_by_fk'
  ) THEN
    ALTER TABLE portal.agents
      ADD CONSTRAINT agents_referred_by_fk
      FOREIGN KEY (referred_by_agent_id) REFERENCES portal.agents(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
