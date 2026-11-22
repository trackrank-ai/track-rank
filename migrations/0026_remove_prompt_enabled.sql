-- Preserve existing monitoring pauses when schedule state becomes the only switch.
UPDATE schedules
SET enabled=0,next_due_at=NULL,retry_at=0
WHERE enabled=1 AND EXISTS (
  SELECT 1 FROM prompts p
  WHERE p.org_id=schedules.org_id AND p.id=schedules.prompt_id AND p.enabled=0
);

DROP TRIGGER schedule_resume_after_prompt_enable;
ALTER TABLE prompts DROP COLUMN enabled;
