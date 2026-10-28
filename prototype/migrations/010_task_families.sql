ALTER TABLE task_variants ADD COLUMN task_id text NOT NULL DEFAULT 'legacy';
ALTER TABLE task_variants ADD COLUMN catalog_hidden_at timestamptz;
UPDATE task_variants SET task_id=COALESCE(snapshot->>'taskId','legacy');
DROP INDEX task_variants_active_unique;
CREATE UNIQUE INDEX task_variants_active_unique ON task_variants(role_id,stage,task_id,variation) WHERE retired_at IS NULL;
CREATE INDEX task_variants_catalog_idx ON task_variants(role_id,stage,task_id,variation) WHERE retired_at IS NULL AND catalog_hidden_at IS NULL;
