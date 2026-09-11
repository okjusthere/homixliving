BEGIN;
ALTER TABLE portal.content_generations ADD COLUMN IF NOT EXISTS batch_id uuid;
ALTER TABLE portal.content_generations ADD COLUMN IF NOT EXISTS predecessor_id uuid REFERENCES portal.content_generations(id);
CREATE INDEX IF NOT EXISTS content_generation_batch ON portal.content_generations(batch_id);
CREATE INDEX IF NOT EXISTS content_generation_predecessor ON portal.content_generations(predecessor_id) WHERE predecessor_id IS NOT NULL;
COMMIT;
