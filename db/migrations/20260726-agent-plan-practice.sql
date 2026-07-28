-- Commission plan + practice area on the roster, and a one-time standardisation
-- of the existing split. Apply BEFORE deploying the code that reads these
-- columns; both are additive with defaults, so the currently deployed version
-- keeps working after it runs.
--
--   plan      standard | growth | elite. Mirrors the desk-fee products in
--             lib/commerce/catalog.ts (80% / 92% / 100% commission retained).
--   practice  rental | sales | both. Null means not yet specified.

BEGIN;

ALTER TABLE portal.agents
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS practice TEXT;

-- Existing agents are all on the standard 80/20 arrangement (agent keeps 80).
-- Deliberately unconditional: this is the agreed company-wide baseline, and
-- any negotiated exception is re-entered by an admin afterwards.
UPDATE portal.agents SET split_pct = 80, updated_at = now()::text
WHERE split_pct IS DISTINCT FROM 80;

COMMIT;
