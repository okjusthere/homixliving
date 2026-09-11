BEGIN;
CREATE TABLE IF NOT EXISTS portal.content_templates (
  id uuid PRIMARY KEY, family_id uuid NOT NULL, seed_key text UNIQUE,
  version integer NOT NULL CHECK(version > 0),
  status text NOT NULL CHECK(status IN ('draft','published','retired')),
  config jsonb NOT NULL, created_by integer REFERENCES portal.agents(id),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(family_id,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS content_template_published ON portal.content_templates(family_id) WHERE status='published';
CREATE TABLE IF NOT EXISTS portal.content_holidays (
  id text PRIMARY KEY, country text NOT NULL CHECK(country IN ('US','CN')),
  name jsonb NOT NULL, greeting jsonb NOT NULL, enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS portal.content_holiday_dates (
  holiday_id text NOT NULL REFERENCES portal.content_holidays(id), year integer NOT NULL,
  date date NOT NULL, PRIMARY KEY(holiday_id,year), CHECK(EXTRACT(YEAR FROM date)=year)
);
CREATE TABLE IF NOT EXISTS portal.content_projects (
  id uuid PRIMARY KEY, owner_agent_id integer NOT NULL REFERENCES portal.agents(id),
  title text NOT NULL, input jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_project_owner ON portal.content_projects(owner_agent_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS portal.content_assets (
  id uuid PRIMARY KEY, owner_agent_id integer NOT NULL REFERENCES portal.agents(id),
  object_key text NOT NULL UNIQUE, content_type text NOT NULL, bytes integer NOT NULL,
  purpose text NOT NULL CHECK(purpose IN ('upload','reference','output','template')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS portal.content_generations (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES portal.content_projects(id),
  owner_agent_id integer NOT NULL REFERENCES portal.agents(id),
  template_id uuid NOT NULL REFERENCES portal.content_templates(id),
  idempotency_key uuid NOT NULL, request_hash text NOT NULL,
  status text NOT NULL CHECK(status IN ('queued','preparing','generating','saving','succeeded','failed','needs_review')),
  input jsonb NOT NULL, brand jsonb NOT NULL, prompt text NOT NULL,
  reference_asset_ids jsonb NOT NULL DEFAULT '[]', output_asset_id uuid REFERENCES portal.content_assets(id),
  error text, provider_request_id text, usage jsonb, workflow_run_id text,
  provider_started_at timestamptz, dispatch_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_agent_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS content_generation_owner ON portal.content_generations(owner_agent_id,created_at DESC);
ALTER TABLE portal.content_generations ADD COLUMN IF NOT EXISTS provider_config jsonb;
CREATE INDEX IF NOT EXISTS content_generation_recovery ON portal.content_generations(status,updated_at);
CREATE TABLE IF NOT EXISTS portal.content_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_agent_id integer NOT NULL REFERENCES portal.agents(id), action text NOT NULL,
  entity_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE portal.content_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.content_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.content_holiday_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.content_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.content_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.content_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.content_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON portal.content_templates,portal.content_holidays,portal.content_holiday_dates,
  portal.content_projects,portal.content_assets,portal.content_generations,portal.content_audit FROM PUBLIC;
COMMIT;
