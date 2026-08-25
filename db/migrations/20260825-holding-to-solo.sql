-- Holding is no longer a compensation plan. Preserve non-producing as an
-- operational status while applying the current Solo agreement and economics.

UPDATE portal.agents
SET plan = 'solo',
    split_pct = 85,
    updated_at = NOW()
WHERE plan = 'holding';

UPDATE portal.onboarding_invitations
SET plan = 'solo'
WHERE plan = 'holding';
