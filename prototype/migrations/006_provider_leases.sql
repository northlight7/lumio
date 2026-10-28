CREATE TABLE provider_leases (
  learner_id uuid PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX provider_leases_expiry_idx ON provider_leases(expires_at);
