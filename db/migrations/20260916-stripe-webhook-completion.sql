-- Run before deploying the new webhook. Safe to repeat.
-- Old handlers wrote the order link only after processing succeeded. Old NULL
-- links may be either completed unmatched events or interrupted claims: leave
-- them unknown and reconcile ONLY when Stripe actually redelivers. This
-- migration never replays events or invokes external services.
-- Old code can still finish requests between this migration and the new
-- deployment. The new handler also recognizes a non-NULL commerce_order_id as
-- legacy completion proof and fills completed_at on a duplicate delivery;
-- it does not rerun settlement. Rows with both columns NULL remain retryable.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='portal'
    AND table_name='stripe_events' AND column_name='completed_at') THEN
    ALTER TABLE portal.stripe_events ADD COLUMN completed_at TIMESTAMPTZ;
    UPDATE portal.stripe_events SET completed_at=COALESCE(received_at,NOW())
      WHERE commerce_order_id IS NOT NULL;
  END IF;
END $$;
