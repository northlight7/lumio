ALTER TABLE attempts DROP CONSTRAINT IF EXISTS attempts_learner_id_role_id_stage_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attempts_curriculum_unique' AND conrelid = 'attempts'::regclass) THEN
    ALTER TABLE attempts ADD CONSTRAINT attempts_curriculum_unique UNIQUE (learner_id, role_id, stage, content_version);
  END IF;
END $$;
