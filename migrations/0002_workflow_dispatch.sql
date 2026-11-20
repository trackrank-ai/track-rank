ALTER TABLE runs ADD COLUMN workflow_started INTEGER NOT NULL DEFAULT 0;
CREATE INDEX runs_dispatch ON runs(status,workflow_started,created_at);
