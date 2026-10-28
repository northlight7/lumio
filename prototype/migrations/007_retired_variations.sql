ALTER TABLE task_variants ADD COLUMN retired_at timestamptz;
ALTER TABLE task_variants DROP CONSTRAINT task_variants_role_id_stage_variation_key;
CREATE UNIQUE INDEX task_variants_active_unique ON task_variants(role_id,stage,variation) WHERE retired_at IS NULL;
