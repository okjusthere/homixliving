-- Real types for temporal and money columns.
--
--   * every *_at instant        TEXT  -> TIMESTAMPTZ
--   * every calendar date       TEXT  -> DATE        (lease/closing/joined/…)
--   * every dollar amount       DOUBLE PRECISION -> NUMERIC(14,2)
--   * per-deal share_pct        DOUBLE PRECISION -> NUMERIC(6,3)  (33.333 splits)
--   * agents.split_pct          DOUBLE PRECISION -> INTEGER       (plans are whole %)
--
-- Deploy the application FIRST, then run this. The new code reads and writes
-- both the old and the new types (temporal values stay strings through
-- drizzle's node-postgres text parsers; ISO strings cast on assignment), so
-- there is no window in either order — but code-first means the historical
-- mixed formats (ISO from the app vs `now()::text` from earlier migrations)
-- are normalized the moment this commits, which also fixes text-order
-- comparisons on updated_at that those rows currently break.
--
-- Existing values: app-written ISO-8601 UTC strings ("2026-07-28T01:14:31.123Z"),
-- migration-written `now()::text` ("2026-07-26 22:20:13.4+00" on Supabase/UTC),
-- and "YYYY-MM-DD" for date fields — all cast cleanly. NULLIF() guards the
-- nullable columns against any stray empty string.

BEGIN;

SET LOCAL timezone = 'UTC';

-- Refuse to run twice: on already-converted columns the NULLIF('') literals
-- below would fail with confusing cast errors partway through. Aborting here
-- keeps the transaction untouched.
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'portal' AND table_name = 'agents' AND column_name = 'created_at') <> 'text' THEN
    RAISE EXCEPTION 'temporal/money type migration appears to be applied already — nothing to do';
  END IF;
END $$;

-- Abort rather than silently round if a fractional split ever slipped in.
DO $$
DECLARE bad integer;
BEGIN
  SELECT count(*) INTO bad FROM portal.agents WHERE split_pct <> round(split_pct);
  IF bad > 0 THEN
    RAISE EXCEPTION 'portal.agents has % fractional split_pct value(s); resolve before migrating', bad;
  END IF;
END $$;

ALTER TABLE portal.buildings
  ALTER COLUMN created_at TYPE timestamptz USING NULLIF(created_at, '')::timestamptz,
  ALTER COLUMN updated_at TYPE timestamptz USING NULLIF(updated_at, '')::timestamptz;

ALTER TABLE portal.invoices
  ALTER COLUMN move_in_date TYPE date        USING NULLIF(move_in_date, '')::date,
  ALTER COLUMN sent_at      TYPE timestamptz USING NULLIF(sent_at, '')::timestamptz,
  ALTER COLUMN paid_at      TYPE timestamptz USING NULLIF(paid_at, '')::timestamptz,
  ALTER COLUMN created_at   TYPE timestamptz USING NULLIF(created_at, '')::timestamptz,
  ALTER COLUMN updated_at   TYPE timestamptz USING NULLIF(updated_at, '')::timestamptz,
  ALTER COLUMN total_amount TYPE numeric(14,2) USING round(total_amount::numeric, 2),
  ALTER COLUMN paid_amount  TYPE numeric(14,2) USING round(paid_amount::numeric, 2);

ALTER TABLE portal.agents
  ALTER COLUMN license_expires_at TYPE date USING NULLIF(license_expires_at, '')::date,
  ALTER COLUMN joined_at          TYPE date USING NULLIF(joined_at, '')::date,
  ALTER COLUMN created_at TYPE timestamptz USING NULLIF(created_at, '')::timestamptz,
  ALTER COLUMN updated_at TYPE timestamptz USING NULLIF(updated_at, '')::timestamptz,
  ALTER COLUMN split_pct  TYPE integer     USING round(split_pct)::integer;

ALTER TABLE portal.rental_deals
  ALTER COLUMN move_in_date     TYPE date USING NULLIF(move_in_date, '')::date,
  ALTER COLUMN lease_start_date TYPE date USING NULLIF(lease_start_date, '')::date,
  ALTER COLUMN lease_end_date   TYPE date USING NULLIF(lease_end_date, '')::date,
  ALTER COLUMN deal_date        TYPE date USING NULLIF(deal_date, '')::date,
  ALTER COLUMN renewal_noted_at TYPE timestamptz USING NULLIF(renewal_noted_at, '')::timestamptz,
  ALTER COLUMN created_at       TYPE timestamptz USING NULLIF(created_at, '')::timestamptz,
  ALTER COLUMN updated_at       TYPE timestamptz USING NULLIF(updated_at, '')::timestamptz,
  ALTER COLUMN rent_amount      TYPE numeric(14,2) USING round(rent_amount::numeric, 2),
  ALTER COLUMN total_commission TYPE numeric(14,2) USING round(total_commission::numeric, 2),
  ALTER COLUMN referrer_amount  TYPE numeric(14,2) USING round(referrer_amount::numeric, 2);

ALTER TABLE portal.rental_deal_agents
  ALTER COLUMN created_at TYPE timestamptz  USING NULLIF(created_at, '')::timestamptz,
  ALTER COLUMN share_pct  TYPE numeric(6,3) USING round(share_pct::numeric, 3);

ALTER TABLE portal.sale_deals
  ALTER COLUMN contract_date    TYPE date USING NULLIF(contract_date, '')::date,
  ALTER COLUMN closing_date     TYPE date USING NULLIF(closing_date, '')::date,
  ALTER COLUMN created_at       TYPE timestamptz USING NULLIF(created_at, '')::timestamptz,
  ALTER COLUMN updated_at       TYPE timestamptz USING NULLIF(updated_at, '')::timestamptz,
  ALTER COLUMN purchase_price   TYPE numeric(14,2) USING round(purchase_price::numeric, 2),
  ALTER COLUMN gross_commission TYPE numeric(14,2) USING round(gross_commission::numeric, 2),
  ALTER COLUMN referral_amount  TYPE numeric(14,2) USING round(referral_amount::numeric, 2),
  ALTER COLUMN brokerage_fee    TYPE numeric(14,2) USING round(brokerage_fee::numeric, 2);

ALTER TABLE portal.sale_deal_agents
  ALTER COLUMN created_at TYPE timestamptz  USING NULLIF(created_at, '')::timestamptz,
  ALTER COLUMN share_pct  TYPE numeric(6,3) USING round(share_pct::numeric, 3);

ALTER TABLE portal.invoice_send_log
  ALTER COLUMN sent_at TYPE timestamptz USING NULLIF(sent_at, '')::timestamptz;

ALTER TABLE portal.training_videos
  ALTER COLUMN created_at TYPE timestamptz USING NULLIF(created_at, '')::timestamptz,
  ALTER COLUMN updated_at TYPE timestamptz USING NULLIF(updated_at, '')::timestamptz;

ALTER TABLE portal.training_video_views
  ALTER COLUMN first_viewed_at TYPE timestamptz USING first_viewed_at::timestamptz,
  ALTER COLUMN last_viewed_at  TYPE timestamptz USING last_viewed_at::timestamptz,
  ALTER COLUMN created_at      TYPE timestamptz USING NULLIF(created_at, '')::timestamptz,
  ALTER COLUMN updated_at      TYPE timestamptz USING NULLIF(updated_at, '')::timestamptz;

ALTER TABLE portal.resources
  ALTER COLUMN created_at TYPE timestamptz USING NULLIF(created_at, '')::timestamptz,
  ALTER COLUMN updated_at TYPE timestamptz USING NULLIF(updated_at, '')::timestamptz;

ALTER TABLE portal.checklist_items
  ALTER COLUMN created_at TYPE timestamptz USING NULLIF(created_at, '')::timestamptz,
  ALTER COLUMN updated_at TYPE timestamptz USING NULLIF(updated_at, '')::timestamptz;

ALTER TABLE portal.commerce_orders
  ALTER COLUMN paid_at    TYPE timestamptz USING NULLIF(paid_at, '')::timestamptz,
  ALTER COLUMN created_at TYPE timestamptz USING NULLIF(created_at, '')::timestamptz,
  ALTER COLUMN updated_at TYPE timestamptz USING NULLIF(updated_at, '')::timestamptz;

ALTER TABLE portal.commerce_charges
  ALTER COLUMN period_start TYPE timestamptz USING NULLIF(period_start, '')::timestamptz,
  ALTER COLUMN period_end   TYPE timestamptz USING NULLIF(period_end, '')::timestamptz,
  ALTER COLUMN paid_at      TYPE timestamptz USING NULLIF(paid_at, '')::timestamptz,
  ALTER COLUMN created_at   TYPE timestamptz USING NULLIF(created_at, '')::timestamptz;

ALTER TABLE portal.agent_payment_profiles
  ALTER COLUMN w9_uploaded_at TYPE timestamptz USING NULLIF(w9_uploaded_at, '')::timestamptz,
  ALTER COLUMN updated_at     TYPE timestamptz USING NULLIF(updated_at, '')::timestamptz;

-- paid_at here is "date the money actually moved" (regex-validated YYYY-MM-DD)
-- and drives 1099 year bucketing — a calendar date, not an instant.
ALTER TABLE portal.agent_payouts
  ALTER COLUMN paid_at    TYPE date        USING paid_at::date,
  ALTER COLUMN created_at TYPE timestamptz USING NULLIF(created_at, '')::timestamptz,
  ALTER COLUMN updated_at TYPE timestamptz USING NULLIF(updated_at, '')::timestamptz;

ALTER TABLE portal.stripe_events
  ALTER COLUMN received_at TYPE timestamptz USING NULLIF(received_at, '')::timestamptz;

ALTER TABLE portal.notifications
  ALTER COLUMN read_at    TYPE timestamptz USING NULLIF(read_at, '')::timestamptz,
  ALTER COLUMN created_at TYPE timestamptz USING NULLIF(created_at, '')::timestamptz;

ALTER TABLE portal.audit_log
  ALTER COLUMN created_at TYPE timestamptz USING NULLIF(created_at, '')::timestamptz;

ALTER TABLE portal.deal_documents
  ALTER COLUMN created_at TYPE timestamptz USING NULLIF(created_at, '')::timestamptz;

COMMIT;
