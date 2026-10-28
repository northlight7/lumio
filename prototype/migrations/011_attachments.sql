CREATE TABLE attachments (
  id uuid PRIMARY KEY,
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 180),
  format text NOT NULL CHECK (format IN ('xlsx','csv','pptx','docx','txt')),
  size integer NOT NULL CHECK (size BETWEEN 1 AND 5242880),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  bytes bytea NOT NULL CHECK (octet_length(bytes)=size),
  extracted_text text NOT NULL CHECK (length(extracted_text) BETWEEN 1 AND 24000),
  substantive_characters integer NOT NULL CHECK (substantive_characters>0),
  extraction_hash text NOT NULL CHECK (extraction_hash ~ '^[a-f0-9]{64}$'),
  limitations jsonb NOT NULL DEFAULT '[]',
  parser_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_owner_idx ON attachments(learner_id,attempt_id);
ALTER TABLE attempts ADD COLUMN attachment_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE submissions ADD COLUMN attachment_ids uuid[] NOT NULL DEFAULT '{}';

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='lumio_app') THEN GRANT SELECT,INSERT,DELETE ON attachments TO lumio_app; END IF; END $$;
