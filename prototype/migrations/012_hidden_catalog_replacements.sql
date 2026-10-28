DROP INDEX task_variants_active_unique;
CREATE UNIQUE INDEX task_variants_active_unique ON task_variants(role_id,stage,task_id,variation) WHERE retired_at IS NULL AND catalog_hidden_at IS NULL;
