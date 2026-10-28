-- Successful AI practice feedback is assistance, independently of chat history.
-- Existing attempts begin at zero. Historical submission snapshots are unchanged.
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS practice_feedback_count integer NOT NULL DEFAULT 0 CHECK (practice_feedback_count >= 0);
