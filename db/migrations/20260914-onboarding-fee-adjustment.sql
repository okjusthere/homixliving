-- Administrative fee reductions are separate from money actually received.
-- Additive only; no existing accounts, receipts or contracts are changed.
ALTER TABLE portal.agents ADD COLUMN IF NOT EXISTS onboarding_fee_adjustment JSONB;
ALTER TABLE portal.agents ADD COLUMN IF NOT EXISTS onboarding_website_sync JSONB;
