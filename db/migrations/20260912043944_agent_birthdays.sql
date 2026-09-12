BEGIN;
-- Birth years are deliberately not collected. These records are admin-only.
CREATE TABLE IF NOT EXISTS portal.agent_celebration_profiles (
  agent_id integer NOT NULL REFERENCES portal.agents(id),
  kind text NOT NULL CHECK(kind IN ('birthday','anniversary')),
  joined_on date,
  month integer, day integer, enabled boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1,
  updated_by integer REFERENCES portal.agents(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(agent_id,kind),
  CHECK(kind <> 'birthday' OR joined_on IS NULL),
  CHECK(kind <> 'anniversary' OR (joined_on IS NULL AND month IS NULL AND day IS NULL) OR (joined_on IS NOT NULL AND month=EXTRACT(MONTH FROM joined_on) AND day=EXTRACT(DAY FROM joined_on))),
  CHECK ((month IS NULL AND day IS NULL) OR
    (month IS NOT NULL AND day IS NOT NULL AND month BETWEEN 1 AND 12
      AND day BETWEEN 1 AND (ARRAY[31,29,31,30,31,30,31,31,30,31,30,31])[month]))
);
ALTER TABLE portal.content_projects ADD COLUMN IF NOT EXISTS admin_only boolean NOT NULL DEFAULT false;
ALTER TABLE portal.content_generations ADD COLUMN IF NOT EXISTS admin_only boolean NOT NULL DEFAULT false;
ALTER TABLE portal.content_assets ADD COLUMN IF NOT EXISTS admin_only boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS portal.agent_celebration_events (
  id uuid PRIMARY KEY,
  agent_id integer NOT NULL REFERENCES portal.agents(id),
  kind text NOT NULL CHECK(kind IN ('birthday','anniversary')),
  year integer NOT NULL,
  celebration_date date NOT NULL,
  profile_revision integer NOT NULL,
  generation_id uuid REFERENCES portal.content_generations(id),
  attempt integer NOT NULL DEFAULT 0,
  blocked_reason text,
  celebrated_at timestamptz,
  celebrated_by integer REFERENCES portal.agents(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id,kind,year), CHECK(EXTRACT(YEAR FROM celebration_date)=year)
);
CREATE INDEX IF NOT EXISTS birthday_event_date ON portal.agent_celebration_events(celebration_date);
CREATE INDEX IF NOT EXISTS celebration_event_generation ON portal.agent_celebration_events(generation_id) WHERE generation_id IS NOT NULL;
ALTER TABLE portal.agent_celebration_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.agent_celebration_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON portal.agent_celebration_profiles,portal.agent_celebration_events FROM PUBLIC;
INSERT INTO portal.content_templates(id,family_id,seed_key,version,status,config)
VALUES ('b1a70000-0000-4000-8000-000000000001','b1a70000-0000-4000-8000-000000000001','birthday-company-v1',1,'published',
  '{"name":{"en":"Company birthday greeting","zh":"公司生日祝福"},"description":{"en":"A warm greeting from the Homix team","zh":"来自 Homix 团队的温暖祝福"},"kind":"birthday","themes":["birthday"],"style":"editorial","prompt":"Warm ivory paper, deep olive typography, restrained gold confetti and a generous photographic portrait. Elegant, personal and celebratory. Strong readable headline and name; quiet company signature. Do not introduce additional copy.","colors":["#f7f4ed","#394a35","#b9924e"],"referenceAssetIds":[],"sizes":["1024x1280"]}')
ON CONFLICT(seed_key) DO NOTHING;
INSERT INTO portal.content_templates(id,family_id,seed_key,version,status,config)
SELECT 'b1a70000-0000-4000-8000-000000000002','b1a70000-0000-4000-8000-000000000002','anniversary-company-v1',1,'published',
  config || '{"kind":"anniversary","themes":["anniversary"],"name":{"en":"Company anniversary greeting","zh":"入职周年祝福"},"description":{"en":"Celebrate another year together","zh":"感谢一路同行"}}'::jsonb
FROM portal.content_templates WHERE seed_key='birthday-company-v1' ON CONFLICT(seed_key) DO NOTHING;
INSERT INTO portal.settings(key,value) VALUES ('birthday_automation','{"enabled":true,"leadDays":7,"dailyLimit":10,"language":"zh"}') ON CONFLICT(key) DO NOTHING;
COMMIT;
