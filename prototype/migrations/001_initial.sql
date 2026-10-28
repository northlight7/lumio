CREATE TABLE IF NOT EXISTS learners (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'Learner',
  email text UNIQUE,
  password_hash text,
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'zh')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_learner_idx ON sessions(learner_id);
CREATE TABLE IF NOT EXISTS attempts (
  id uuid PRIMARY KEY,
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  role_id text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('taster', 'diagnose', 'fix', 'adapt', 'assessment')),
  locale text NOT NULL CHECK (locale IN ('en', 'zh')),
  answers jsonb NOT NULL DEFAULT '{}',
  work text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  content_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attempts_curriculum_unique UNIQUE (learner_id, role_id, stage, content_version)
);
CREATE INDEX IF NOT EXISTS attempts_learner_idx ON attempts(learner_id);
CREATE TABLE IF NOT EXISTS submissions (
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  answers jsonb NOT NULL,
  work text NOT NULL,
  evaluation jsonb NOT NULL,
  assistance integer NOT NULL DEFAULT 0,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, version),
  UNIQUE (attempt_id, request_id)
);
CREATE TABLE IF NOT EXISTS ai_requests (
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  persona text NOT NULL CHECK (persona IN ('coach', 'manager')),
  user_content text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending', 'complete', 'failed')),
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, request_id)
);
CREATE INDEX IF NOT EXISTS ai_requests_learner_idx ON ai_requests(learner_id, created_at);
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES ai_requests(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  persona text NOT NULL CHECK (persona IN ('coach', 'manager')),
  content text NOT NULL,
  source text NOT NULL CHECK (source IN ('learner', 'deepseek', 'scripted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, role)
);
CREATE TABLE IF NOT EXISTS shares (
  id uuid PRIMARY KEY,
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  attempt_ids uuid[] NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quotas (
  key text PRIMARY KEY,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL
);
