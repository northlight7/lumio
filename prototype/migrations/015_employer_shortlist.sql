CREATE TABLE employer_shortlists (
  employer_id uuid NOT NULL REFERENCES employer_accounts(id) ON DELETE CASCADE,
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employer_id, learner_id)
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lumio_app') THEN
    GRANT SELECT, INSERT, DELETE ON employer_shortlists TO lumio_app;
  END IF;
END $$;
