-- Give prelaunch schedules the same stored format as newly created schedules.
-- An interrupted sweep may have admitted a run before writing last_slot.
WITH schedule_days AS (
  SELECT s.id,
         max(
           CASE WHEN length(s.last_slot) = 10 THEN s.last_slot ELSE '' END,
           coalesce((
             SELECT max(substr(a.idempotency_key, length(s.id) + 11))
             FROM run_admissions a
             WHERE a.org_id = s.org_id
               AND a.idempotency_key >= 'schedule:' || s.id || ':'
               AND a.idempotency_key < 'schedule:' || s.id || ';'
               AND substr(a.idempotency_key, length(s.id) + 11) GLOB
                   '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
           ), '')
         ) AS last_day
  FROM schedules s
  WHERE s.batch_id IS NULL OR json_array_length(s.times_json) = 0
)
UPDATE schedules
SET times_json = CASE WHEN json_array_length(times_json) = 0 THEN json_array(local_time) ELSE times_json END,
    batch_id = coalesce(batch_id, schedules.id),
    last_slot = CASE
      WHEN schedule_days.last_day <> '' AND schedule_days.last_day || '@' || local_time > coalesce(last_slot, '')
      THEN schedule_days.last_day || '@' || local_time
      ELSE last_slot
    END
FROM schedule_days
WHERE schedules.id = schedule_days.id;

ALTER TABLE schedules DROP COLUMN local_time;
