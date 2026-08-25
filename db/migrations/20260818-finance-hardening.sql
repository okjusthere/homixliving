BEGIN;

ALTER TABLE portal.commerce_orders
  ADD COLUMN IF NOT EXISTS payment_channel TEXT NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS offline_method TEXT,
  ADD COLUMN IF NOT EXISTS offline_reference TEXT,
  ADD COLUMN IF NOT EXISTS verified_by_email TEXT,
  ADD COLUMN IF NOT EXISTS external_payment_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_orders_external_payment_key
  ON portal.commerce_orders(external_payment_key)
  WHERE external_payment_key IS NOT NULL;

ALTER TABLE portal.commerce_orders
  DROP CONSTRAINT IF EXISTS commerce_orders_payment_channel_check,
  ADD CONSTRAINT commerce_orders_payment_channel_check
    CHECK (payment_channel IN ('stripe','offline')),
  DROP CONSTRAINT IF EXISTS commerce_orders_offline_evidence_check,
  ADD CONSTRAINT commerce_orders_offline_evidence_check
    CHECK (
      payment_channel <> 'offline' OR (
        offline_method IN ('cash','check','ach','zelle','wire','other') AND
        offline_reference IS NOT NULL AND
        verified_by_email IS NOT NULL AND
        external_payment_key IS NOT NULL AND
        paid_at IS NOT NULL
      )
    );

ALTER TABLE portal.agent_payouts
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_payouts_idempotency_key
  ON portal.agent_payouts(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE portal.sponsor_plan_rewards
  ADD COLUMN IF NOT EXISTS paid_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ;

UPDATE portal.sponsor_plan_rewards
SET available_at = earned_at
WHERE available_at IS NULL;

ALTER TABLE portal.sponsor_plan_rewards
  DROP CONSTRAINT IF EXISTS sponsor_plan_rewards_status_check,
  ADD CONSTRAINT sponsor_plan_rewards_status_check
    CHECK (status IN ('accrued','partially_paid','paid','void')),
  DROP CONSTRAINT IF EXISTS sponsor_plan_rewards_paid_cents_check,
  ADD CONSTRAINT sponsor_plan_rewards_paid_cents_check
    CHECK (paid_cents >= 0 AND paid_cents <= amount_cents);

ALTER TABLE portal.payout_applications
  ALTER COLUMN obligation_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS sponsor_plan_reward_id INTEGER;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payout_applications_sponsor_plan_reward_fk'
  ) THEN
    ALTER TABLE portal.payout_applications
      ADD CONSTRAINT payout_applications_sponsor_plan_reward_fk
      FOREIGN KEY (sponsor_plan_reward_id)
      REFERENCES portal.sponsor_plan_rewards(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE portal.payout_applications
  DROP CONSTRAINT IF EXISTS payout_applications_exactly_one_target,
  ADD CONSTRAINT payout_applications_exactly_one_target
    CHECK (num_nonnulls(obligation_id, sponsor_plan_reward_id) = 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_application_plan_reward
  ON portal.payout_applications(payout_id, sponsor_plan_reward_id)
  WHERE sponsor_plan_reward_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payout_application_plan_reward
  ON portal.payout_applications(sponsor_plan_reward_id);

COMMIT;
