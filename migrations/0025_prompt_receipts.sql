CREATE TABLE prompt_receipts (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  receipt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (org_id,id)
);

ALTER TABLE run_batches ADD COLUMN workspace_id TEXT;
ALTER TABLE run_batches ADD COLUMN requested INTEGER;
ALTER TABLE run_batches ADD COLUMN receipt_id TEXT;
CREATE INDEX run_batches_receipt ON run_batches(org_id,receipt_id,created_at DESC) WHERE receipt_id IS NOT NULL;

CREATE TABLE prompt_receipt_actions (
  org_id TEXT NOT NULL,
  receipt_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  run_result TEXT,
  schedule_result TEXT,
  PRIMARY KEY (org_id,receipt_id),
  FOREIGN KEY (org_id,receipt_id) REFERENCES prompt_receipts(org_id,id) ON DELETE CASCADE
);

CREATE INDEX runs_prompt_history ON runs(org_id,prompt_id,workspace_id,created_at DESC,id DESC);
