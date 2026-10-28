CREATE TABLE employer_accounts (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  company_id text NOT NULL,
  name text NOT NULL,
  requirements jsonb NOT NULL DEFAULT '[]',
  requirements_revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE employer_sessions (
  token_hash text PRIMARY KEY,
  employer_id uuid NOT NULL REFERENCES employer_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employer_sessions_owner_idx ON employer_sessions(employer_id);
CREATE TABLE employer_evidence_consents (
  id uuid PRIMARY KEY,
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  share_id uuid NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  company_id text NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (share_id, company_id)
);
CREATE INDEX employer_consents_company_idx ON employer_evidence_consents(company_id) WHERE revoked_at IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lumio_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON employer_accounts, employer_sessions, employer_evidence_consents TO lumio_app;
  END IF;
END $$;
