-- Real types for temporal and money columns — hardened for legacy junk.
--
-- Supersedes 20260728-temporal-and-money-types.sql, which assumed every stored
-- value was a real timestamp. The Turso/SQLite port left literal strings like
-- "CURRENT_TIMESTAMP" in some rows, which aborted the plain ::timestamptz cast.
--
-- Two classes of junk are handled:
--   * unparseable      "CURRENT_TIMESTAMP", "", garbage  -> NULL
--   * relative literals "now", "now()", "today", "epoch" -> NULL
--     (Postgres ACCEPTS these and would silently stamp them with the moment
--     this migration runs — a wrong value is worse than a missing one.)
--
-- Guards: refuses to run twice, refuses on fractional split_pct, and refuses
-- if agent_payouts.paid_at (the 1099 basis) holds anything unparseable —
-- that column must never be guessed.

BEGIN;

SET LOCAL timezone = 'UTC';

-- ── helpers ───────────────────────────────────────────────────────────────
-- A value that only Postgres's "special" date input would accept carries no
-- real information; treat it as absent rather than as "whenever this ran".
CREATE OR REPLACE FUNCTION portal.__relative(v text) RETURNS boolean AS $$
  SELECT btrim(lower(coalesce(v, ''))) ~
    '^(now|today|tomorrow|yesterday|epoch|allballs|current_timestamp|current_date|current_time|infinity|[+-]infinity)(\(\))?$';
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION portal.__ts(v text) RETURNS timestamptz AS $$
BEGIN
  IF v IS NULL OR btrim(v) = '' OR portal.__relative(v) THEN RETURN NULL; END IF;
  RETURN v::timestamptz;
EXCEPTION WHEN others THEN RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION portal.__dt(v text) RETURNS date AS $$
BEGIN
  IF v IS NULL OR btrim(v) = '' OR portal.__relative(v) THEN RETURN NULL; END IF;
  RETURN v::date;
EXCEPTION WHEN others THEN RETURN NULL;
END $$ LANGUAGE plpgsql;

-- ── guards ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'portal' AND table_name = 'agents' AND column_name = 'created_at') <> 'text' THEN
    RAISE EXCEPTION 'temporal/money type migration appears to be applied already — nothing to do';
  END IF;
END $$;

DO $$
DECLARE bad integer;
BEGIN
  SELECT count(*) INTO bad FROM portal.agents WHERE split_pct <> round(split_pct);
  IF bad > 0 THEN
    RAISE EXCEPTION 'portal.agents has % fractional split_pct value(s); resolve before migrating', bad;
  END IF;
END $$;

-- The 1099 basis. Never guess this one.
DO $$
DECLARE bad integer;
BEGIN
  SELECT count(*) INTO bad FROM portal.agent_payouts WHERE portal.__dt(paid_at) IS NULL;
  IF bad > 0 THEN
    RAISE EXCEPTION 'portal.agent_payouts has % row(s) whose paid_at is not a real date — fix those rows by hand first (they drive 1099 totals)', bad;
  END IF;
END $$;

-- Legacy column DEFAULTs that are themselves uncastable text literals would
-- break ALTER ... TYPE independently of the data. Drop them; the application
-- writes these columns explicitly on every insert.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name AS t, c.column_name AS cn
    FROM information_schema.columns c
    WHERE c.table_schema = 'portal' AND c.data_type = 'text'
      AND c.column_default IS NOT NULL
      AND (c.column_name LIKE '%\_at' OR c.column_name LIKE '%\_date'
           OR c.column_name IN ('period_start','period_end'))
  LOOP
    EXECUTE format('ALTER TABLE portal.%I ALTER COLUMN %I DROP DEFAULT', r.t, r.cn);
    RAISE NOTICE 'dropped legacy default on %.%', r.t, r.cn;
  END LOOP;
END $$;

-- NOT NULL analytics timestamps: fall back to the row's own created_at before
-- the column becomes NOT NULL timestamptz (these are view counters, not money).
UPDATE portal.training_video_views
   SET first_viewed_at = coalesce(portal.__ts(first_viewed_at), portal.__ts(created_at), now())::text
 WHERE portal.__ts(first_viewed_at) IS NULL;
UPDATE portal.training_video_views
   SET last_viewed_at = coalesce(portal.__ts(last_viewed_at), portal.__ts(created_at), now())::text
 WHERE portal.__ts(last_viewed_at) IS NULL;

-- ── conversions ───────────────────────────────────────────────────────────
ALTER TABLE portal.buildings
  ALTER COLUMN created_at TYPE timestamptz USING portal.__ts(created_at),
  ALTER COLUMN updated_at TYPE timestamptz USING portal.__ts(updated_at);

ALTER TABLE portal.invoices
  ALTER COLUMN move_in_date TYPE date        USING portal.__dt(move_in_date),
  ALTER COLUMN sent_at      TYPE timestamptz USING portal.__ts(sent_at),
  ALTER COLUMN paid_at      TYPE timestamptz USING portal.__ts(paid_at),
  ALTER COLUMN created_at   TYPE timestamptz USING portal.__ts(created_at),
  ALTER COLUMN updated_at   TYPE timestamptz USING portal.__ts(updated_at),
  ALTER COLUMN total_amount TYPE numeric(14,2) USING round(total_amount::numeric, 2),
  ALTER COLUMN paid_amount  TYPE numeric(14,2) USING round(paid_amount::numeric, 2);

ALTER TABLE portal.agents
  ALTER COLUMN license_expires_at TYPE date USING portal.__dt(license_expires_at),
  ALTER COLUMN joined_at          TYPE date USING portal.__dt(joined_at),
  ALTER COLUMN created_at TYPE timestamptz USING portal.__ts(created_at),
  ALTER COLUMN updated_at TYPE timestamptz USING portal.__ts(updated_at),
  ALTER COLUMN split_pct  TYPE integer     USING round(split_pct)::integer;

ALTER TABLE portal.rental_deals
  ALTER COLUMN move_in_date     TYPE date USING portal.__dt(move_in_date),
  ALTER COLUMN lease_start_date TYPE date USING portal.__dt(lease_start_date),
  ALTER COLUMN lease_end_date   TYPE date USING portal.__dt(lease_end_date),
  ALTER COLUMN deal_date        TYPE date USING portal.__dt(deal_date),
  ALTER COLUMN renewal_noted_at TYPE timestamptz USING portal.__ts(renewal_noted_at),
  ALTER COLUMN created_at       TYPE timestamptz USING portal.__ts(created_at),
  ALTER COLUMN updated_at       TYPE timestamptz USING portal.__ts(updated_at),
  ALTER COLUMN rent_amount      TYPE numeric(14,2) USING round(rent_amount::numeric, 2),
  ALTER COLUMN total_commission TYPE numeric(14,2) USING round(total_commission::numeric, 2),
  ALTER COLUMN referrer_amount  TYPE numeric(14,2) USING round(referrer_amount::numeric, 2);

ALTER TABLE portal.rental_deal_agents
  ALTER COLUMN created_at TYPE timestamptz  USING portal.__ts(created_at),
  ALTER COLUMN share_pct  TYPE numeric(6,3) USING round(share_pct::numeric, 3);

ALTER TABLE portal.sale_deals
  ALTER COLUMN contract_date    TYPE date USING portal.__dt(contract_date),
  ALTER COLUMN closing_date     TYPE date USING portal.__dt(closing_date),
  ALTER COLUMN created_at       TYPE timestamptz USING portal.__ts(created_at),
  ALTER COLUMN updated_at       TYPE timestamptz USING portal.__ts(updated_at),
  ALTER COLUMN purchase_price   TYPE numeric(14,2) USING round(purchase_price::numeric, 2),
  ALTER COLUMN gross_commission TYPE numeric(14,2) USING round(gross_commission::numeric, 2),
  ALTER COLUMN referral_amount  TYPE numeric(14,2) USING round(referral_amount::numeric, 2),
  ALTER COLUMN brokerage_fee    TYPE numeric(14,2) USING round(brokerage_fee::numeric, 2);

ALTER TABLE portal.sale_deal_agents
  ALTER COLUMN created_at TYPE timestamptz  USING portal.__ts(created_at),
  ALTER COLUMN share_pct  TYPE numeric(6,3) USING round(share_pct::numeric, 3);

ALTER TABLE portal.invoice_send_log
  ALTER COLUMN sent_at TYPE timestamptz USING portal.__ts(sent_at);

ALTER TABLE portal.training_videos
  ALTER COLUMN created_at TYPE timestamptz USING portal.__ts(created_at),
  ALTER COLUMN updated_at TYPE timestamptz USING portal.__ts(updated_at);

ALTER TABLE portal.training_video_views
  ALTER COLUMN first_viewed_at TYPE timestamptz USING portal.__ts(first_viewed_at),
  ALTER COLUMN last_viewed_at  TYPE timestamptz USING portal.__ts(last_viewed_at),
  ALTER COLUMN created_at      TYPE timestamptz USING portal.__ts(created_at),
  ALTER COLUMN updated_at      TYPE timestamptz USING portal.__ts(updated_at);

ALTER TABLE portal.resources
  ALTER COLUMN created_at TYPE timestamptz USING portal.__ts(created_at),
  ALTER COLUMN updated_at TYPE timestamptz USING portal.__ts(updated_at);

ALTER TABLE portal.checklist_items
  ALTER COLUMN created_at TYPE timestamptz USING portal.__ts(created_at),
  ALTER COLUMN updated_at TYPE timestamptz USING portal.__ts(updated_at);

ALTER TABLE portal.commerce_orders
  ALTER COLUMN paid_at    TYPE timestamptz USING portal.__ts(paid_at),
  ALTER COLUMN created_at TYPE timestamptz USING portal.__ts(created_at),
  ALTER COLUMN updated_at TYPE timestamptz USING portal.__ts(updated_at);

ALTER TABLE portal.commerce_charges
  ALTER COLUMN period_start TYPE timestamptz USING portal.__ts(period_start),
  ALTER COLUMN period_end   TYPE timestamptz USING portal.__ts(period_end),
  ALTER COLUMN paid_at      TYPE timestamptz USING portal.__ts(paid_at),
  ALTER COLUMN created_at   TYPE timestamptz USING portal.__ts(created_at);

ALTER TABLE portal.agent_payment_profiles
  ALTER COLUMN w9_uploaded_at TYPE timestamptz USING portal.__ts(w9_uploaded_at),
  ALTER COLUMN updated_at     TYPE timestamptz USING portal.__ts(updated_at);

-- paid_at here is "date the money actually moved" (regex-validated YYYY-MM-DD)
-- and drives 1099 year bucketing — a calendar date, not an instant. The guard
-- above proved every value parses.
ALTER TABLE portal.agent_payouts
  ALTER COLUMN paid_at    TYPE date        USING portal.__dt(paid_at),
  ALTER COLUMN created_at TYPE timestamptz USING portal.__ts(created_at),
  ALTER COLUMN updated_at TYPE timestamptz USING portal.__ts(updated_at);

ALTER TABLE portal.stripe_events
  ALTER COLUMN received_at TYPE timestamptz USING portal.__ts(received_at);

ALTER TABLE portal.notifications
  ALTER COLUMN read_at    TYPE timestamptz USING portal.__ts(read_at),
  ALTER COLUMN created_at TYPE timestamptz USING portal.__ts(created_at);

ALTER TABLE portal.audit_log
  ALTER COLUMN created_at TYPE timestamptz USING portal.__ts(created_at);

ALTER TABLE portal.deal_documents
  ALTER COLUMN created_at TYPE timestamptz USING portal.__ts(created_at);

DROP FUNCTION portal.__ts(text);
DROP FUNCTION portal.__dt(text);
DROP FUNCTION portal.__relative(text);

COMMIT;
