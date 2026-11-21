ALTER TABLE schedules ADD COLUMN next_due_at INTEGER;
ALTER TABLE schedules ADD COLUMN eligible_after INTEGER NOT NULL DEFAULT 0;
CREATE TRIGGER schedule_resume_after_prompt_enable
AFTER UPDATE OF enabled ON prompts
WHEN OLD.enabled=0 AND NEW.enabled=1
BEGIN
  UPDATE schedules SET next_due_at=NULL,eligible_after=CAST(unixepoch('subsec')*1000 AS INTEGER)
  WHERE org_id=NEW.org_id AND prompt_id=NEW.id AND enabled=1;
END;
ALTER TABLE schedules ADD COLUMN retry_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX schedules_due ON schedules(next_due_at,id) WHERE enabled=1;

ALTER TABLE runs ADD COLUMN workflow_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN workflow_dispatched_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN submitted_at INTEGER;
ALTER TABLE runs ADD COLUMN poll_after INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN poll_lease_until INTEGER NOT NULL DEFAULT 0;
UPDATE runs SET submitted_at=updated_at WHERE status='submitted';
CREATE INDEX runs_poll_due ON runs(poll_after,id) WHERE status='submitted';
