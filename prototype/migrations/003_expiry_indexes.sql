CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS quotas_expiry_idx ON quotas(expires_at);
CREATE INDEX IF NOT EXISTS shares_expiry_idx ON shares(expires_at) WHERE revoked_at IS NULL;
