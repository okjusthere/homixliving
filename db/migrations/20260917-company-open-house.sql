BEGIN;
CREATE TABLE IF NOT EXISTS portal.content_open_house_jobs (
  id uuid PRIMARY KEY,
  fingerprint text NOT NULL UNIQUE,
  created_by integer NOT NULL REFERENCES portal.agents(id),
  subject_agent_id integer NOT NULL REFERENCES portal.agents(id),
  listing jsonb NOT NULL,
  request jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','preparing','submitted','failed')),
  error text,
  dispatch_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE portal.content_open_house_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON portal.content_open_house_jobs FROM PUBLIC;
CREATE INDEX IF NOT EXISTS content_open_house_pending ON portal.content_open_house_jobs(updated_at) WHERE status IN ('queued','preparing');
COMMIT;
