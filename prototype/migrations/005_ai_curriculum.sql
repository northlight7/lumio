CREATE TABLE task_variants (
  id uuid PRIMARY KEY,
  role_id text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('taster','diagnose','fix','adapt','assessment')),
  variation integer NOT NULL CHECK (variation > 0),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role_id, stage, variation)
);
ALTER TABLE attempts ADD COLUMN variant_id uuid REFERENCES task_variants(id);
ALTER TABLE attempts DROP CONSTRAINT attempts_curriculum_unique;
CREATE UNIQUE INDEX attempts_legacy_unique ON attempts(learner_id,role_id,stage,content_version) WHERE variant_id IS NULL;
CREATE UNIQUE INDEX attempts_variant_unique ON attempts(learner_id,variant_id) WHERE variant_id IS NOT NULL;
CREATE TABLE generation_locks (
  key text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE TABLE grading_requests (
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  fingerprint text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','complete','failed')),
  evaluation jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(attempt_id,request_id)
);
CREATE INDEX grading_requests_owner_idx ON grading_requests(learner_id,updated_at);
