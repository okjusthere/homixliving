-- STEP 1 — read-only scan. Lists every text temporal value in portal.* that
-- cannot become a real timestamp/date. Nothing is modified.

CREATE OR REPLACE FUNCTION portal.__parses(v text, target text)
RETURNS boolean AS $$
BEGIN
  IF v IS NULL OR btrim(v) = '' THEN RETURN true; END IF;
  IF target = 'date' THEN PERFORM v::date; ELSE PERFORM v::timestamptz; END IF;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION portal.__scan_bad_temporal()
RETURNS TABLE(tbl text, col text, target text, nullable text, bad_rows bigint, sample_values text)
AS $$
DECLARE r record; n bigint; s text;
BEGIN
  FOR r IN
    SELECT c.table_name AS t, c.column_name AS cn, c.is_nullable AS nul,
           CASE WHEN c.column_name IN
             ('move_in_date','lease_start_date','lease_end_date','deal_date',
              'contract_date','closing_date','license_expires_at','joined_at')
             OR (c.table_name = 'agent_payouts' AND c.column_name = 'paid_at')
           THEN 'date' ELSE 'timestamptz' END AS tgt
    FROM information_schema.columns c
    WHERE c.table_schema = 'portal' AND c.data_type = 'text'
      AND (c.column_name LIKE '%\_at' OR c.column_name LIKE '%\_date'
           OR c.column_name IN ('period_start','period_end'))
    ORDER BY c.table_name, c.column_name
  LOOP
    EXECUTE format(
      'SELECT count(*), coalesce(string_agg(DISTINCT %I, '' | ''), '''')
         FROM portal.%I WHERE NOT portal.__parses(%I, %L)',
      r.cn, r.t, r.cn, r.tgt)
    INTO n, s;
    IF n > 0 THEN
      tbl := r.t; col := r.cn; target := r.tgt; nullable := r.nul;
      bad_rows := n; sample_values := left(s, 300);
      RETURN NEXT;
    END IF;
  END LOOP;
END $$ LANGUAGE plpgsql;

SELECT * FROM portal.__scan_bad_temporal();
