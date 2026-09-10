ALTER TABLE portal.agents
  ADD COLUMN IF NOT EXISTS agreement_agent_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agreement_countersigned_at TIMESTAMPTZ;

UPDATE portal.agents
SET agreement_agent_signed_at = COALESCE(agreement_agent_signed_at, agreement_completed_at),
    agreement_countersigned_at = COALESCE(agreement_countersigned_at, agreement_completed_at)
WHERE agreement_status = 'completed'
  AND agreement_completed_at IS NOT NULL
  AND (agreement_agent_signed_at IS NULL OR agreement_countersigned_at IS NULL);
