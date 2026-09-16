-- Additive internal intake records only. No account, signing or payment backfill.
-- Apply before deploying code that selects these columns.
BEGIN;
ALTER TABLE portal.agents ADD COLUMN IF NOT EXISTS license_release JSONB;
ALTER TABLE portal.agents ADD COLUMN IF NOT EXISTS dos_confirmation JSONB;
COMMENT ON COLUMN portal.agents.license_release IS 'Applicant declaration of previous brokerage release; not proof of DOS affiliation';
COMMENT ON COLUMN portal.agents.dos_confirmation IS 'Administrator DOS verification snapshot: legal identity, license, company, actor and time; not an eSign signature';
COMMIT;
