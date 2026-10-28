UPDATE task_variants SET retired_at=now() WHERE retired_at IS NULL AND snapshot->'task'->'company' IS NULL;
