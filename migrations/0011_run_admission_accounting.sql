CREATE TABLE run_usage (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  runs INTEGER NOT NULL CHECK (runs >= 0),
  PRIMARY KEY (org_id, period)
) WITHOUT ROWID;

CREATE TABLE run_admissions (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  PRIMARY KEY (org_id, idempotency_key)
) WITHOUT ROWID;

-- Preserve every existing replay key and initialize the active quota buckets.
INSERT INTO run_admissions (org_id, idempotency_key)
SELECT org_id, idempotency_key FROM runs;

INSERT INTO run_usage (org_id, period, runs)
SELECT org_id, strftime('%Y-%m-%d', created_at / 1000.0, 'unixepoch'), count(*)
FROM runs
WHERE created_at >= unixepoch('now', 'start of month') * 1000
  AND created_at < unixepoch('now', 'start of month', '+1 month') * 1000
GROUP BY org_id, 2;

INSERT INTO run_usage (org_id, period, runs)
SELECT org_id, strftime('%Y-%m', created_at / 1000.0, 'unixepoch'), count(*)
FROM runs
WHERE created_at >= unixepoch('now', 'start of month') * 1000
  AND created_at < unixepoch('now', 'start of month', '+1 month') * 1000
GROUP BY org_id, 2;

CREATE TRIGGER runs_preserve_admitted_identity BEFORE INSERT ON runs
WHEN EXISTS (
  SELECT 1 FROM run_admissions
  WHERE org_id = NEW.org_id AND idempotency_key = NEW.idempotency_key
)
BEGIN
  SELECT RAISE(IGNORE);
END;

CREATE TRIGGER runs_record_admission AFTER INSERT ON runs
BEGIN
  INSERT INTO run_admissions (org_id, idempotency_key)
  VALUES (NEW.org_id, NEW.idempotency_key);

  INSERT INTO run_usage (org_id, period, runs)
  VALUES
    (NEW.org_id, strftime('%Y-%m-%d', NEW.created_at / 1000.0, 'unixepoch'), 1),
    (NEW.org_id, strftime('%Y-%m', NEW.created_at / 1000.0, 'unixepoch'), 1)
  ON CONFLICT (org_id, period) DO UPDATE SET runs = run_usage.runs + 1;
END;
