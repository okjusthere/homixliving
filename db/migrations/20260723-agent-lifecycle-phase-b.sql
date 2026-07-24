-- Contract phase: apply only after BOTH Vercel projects run the new lifecycle
-- code and Phase A has been verified.

BEGIN;

ALTER TABLE portal.agents
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS approval_status;

ALTER TABLE public.agents
  DROP COLUMN IF EXISTS visible,
  DROP COLUMN IF EXISTS edit_token;

COMMIT;
