CREATE INDEX grading_requests_completed_evidence_idx
ON grading_requests(attempt_id,learner_id,fingerprint,created_at,id)
WHERE state='complete' AND evaluation IS NOT NULL;
