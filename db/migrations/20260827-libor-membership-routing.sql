ALTER TABLE portal.agents
  ADD COLUMN IF NOT EXISTS libor_membership_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agents_libor_membership_status_check'
      AND conrelid = 'portal.agents'::regclass
  ) THEN
    ALTER TABLE portal.agents
      ADD CONSTRAINT agents_libor_membership_status_check
      CHECK (
        libor_membership_status IS NULL
        OR libor_membership_status IN ('apply_new', 'existing_member')
      );
  END IF;
END
$$;
