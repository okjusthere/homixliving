BEGIN;
CREATE TABLE IF NOT EXISTS portal.content_office_tasks (
  id uuid PRIMARY KEY,
  created_by integer NOT NULL REFERENCES portal.agents(id),
  subject_agent_id integer NOT NULL REFERENCES portal.agents(id),
  request jsonb NOT NULL,
  submission_key uuid NOT NULL UNIQUE,
  submission_started_at timestamptz,
  generation_id uuid REFERENCES portal.content_generations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE portal.content_office_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON portal.content_office_tasks FROM PUBLIC;
CREATE INDEX IF NOT EXISTS content_office_tasks_created ON portal.content_office_tasks(created_at DESC);
ALTER TABLE portal.content_generations ADD COLUMN IF NOT EXISTS office_task_id uuid REFERENCES portal.content_office_tasks(id);
ALTER TABLE portal.content_generations ADD COLUMN IF NOT EXISTS created_by integer REFERENCES portal.agents(id);
ALTER TABLE portal.content_generations ADD COLUMN IF NOT EXISTS review_status text CHECK(review_status IN ('pending','approved','delivered'));
CREATE INDEX IF NOT EXISTS content_generation_office ON portal.content_generations(office_task_id) WHERE office_task_id IS NOT NULL;
INSERT INTO portal.content_templates(id,family_id,seed_key,version,status,config)
VALUES ('142fbb00-442c-4bcc-aedf-64931204f7c0','142fbb00-442c-4bcc-aedf-64931204f7c0','custom-freeform-v1',1,'published',
  '{"name":{"en":"Other · Freeform","zh":"其他 · 自由创作"},"description":{"en":"Write your own poster prompt","zh":"自由编写提示词，不限定风格"},"kind":"custom","themes":["*"],"style":"freeform","prompt":"Follow the user supplied creative direction without imposing a house style.","colors":["#F7F3EB","#262521","#A88B55"],"referenceAssetIds":[],"sizes":["1024x1024","1024x1280","1152x2048"]}'::jsonb)
ON CONFLICT(seed_key) DO NOTHING;
COMMIT;
