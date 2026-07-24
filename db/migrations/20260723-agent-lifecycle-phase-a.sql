-- Expand phase: apply before deploying the lifecycle-aware portal and website.
-- This phase is backward-compatible with the previous is_active/approval_status
-- and visible/edit_token application versions.

BEGIN;

ALTER TABLE portal.agents
  ADD COLUMN IF NOT EXISTS account_status TEXT;

UPDATE portal.agents
SET account_status = CASE
  WHEN is_active THEN 'active'
  WHEN COALESCE(approval_status, '') = 'pending' THEN 'pending'
  ELSE 'inactive'
END
WHERE account_status IS NULL;

ALTER TABLE portal.agents
  ALTER COLUMN account_status SET DEFAULT 'pending',
  ALTER COLUMN account_status SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agents_account_status_check'
      AND conrelid = 'portal.agents'::regclass
  ) THEN
    ALTER TABLE portal.agents
      ADD CONSTRAINT agents_account_status_check
      CHECK (account_status IN ('pending', 'active', 'inactive'));
  END IF;
END $$;

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS visibility_status TEXT;

UPDATE public.agents
SET visibility_status = CASE
  WHEN visible THEN 'visible'
  ELSE 'admin_hidden'
END
WHERE visibility_status IS NULL;

ALTER TABLE public.agents
  ALTER COLUMN visibility_status SET DEFAULT 'visible',
  ALTER COLUMN visibility_status SET NOT NULL,
  ALTER COLUMN edit_token DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agents_visibility_status_check'
      AND conrelid = 'public.agents'::regclass
  ) THEN
    ALTER TABLE public.agents
      ADD CONSTRAINT agents_visibility_status_check
      CHECK (visibility_status IN ('visible', 'agent_hidden', 'admin_hidden'));
  END IF;
END $$;

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS portal_agent_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_agents_portal_link
  ON public.agents(portal_agent_id)
  WHERE portal_agent_id IS NOT NULL;

DROP POLICY IF EXISTS "agents public read" ON public.agents;
CREATE POLICY "agents public read"
  ON public.agents FOR SELECT
  USING (visibility_status = 'visible');

COMMIT;
