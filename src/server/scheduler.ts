import { all, exec, now, type Env, type Row } from "./types";
import { collectRun, createRun } from "./provider";
import { launchRun } from "./dispatch";
export function localSlot(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (key: string) => parts.find((p) => p.type === key)?.value || "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      get("weekday"),
    ),
  };
}
export function scheduleDue(schedule: Row, date: Date) {
  const slot = localSlot(date, String(schedule.timezone));
  const days = JSON.parse(String(schedule.days)) as number[];
  if (!days.includes(slot.day)) return null;
  const times = JSON.parse(String(schedule.times_json)) as string[];
  // Catch up the most recent due time only; never burst all missed historical slots.
  const due = [...times].sort().filter(time=>time<=slot.time).at(-1);
  const key = due ? `${slot.date}@${due}` : null;
  return key && schedule.last_slot !== key ? key : null;
}
export async function sweep(env: Env) {
  const t = now();
  await exec(
    env,
    "UPDATE runs SET status='uncertain',error='Worker stopped during submission. Automatic resubmission disabled to prevent duplicate charges.',updated_at=? WHERE status='submitting' AND updated_at<?",
    t,
    t - 10 * 60 * 1000,
  );
  await exec(
    env,
    "UPDATE runs SET status='failed',error='Provider task exceeded 72 hours; inspect provider task history.',updated_at=? WHERE status='submitted' AND created_at<?",
    t,
    t - 72 * 60 * 60 * 1000,
  );
  const schedules = await all(
    env,
    "SELECT * FROM (SELECT s.*,ROW_NUMBER() OVER(PARTITION BY s.org_id ORDER BY COALESCE(s.last_slot,''),s.created_at) AS tenant_position FROM schedules s JOIN prompts p ON p.org_id=s.org_id AND p.id=s.prompt_id WHERE s.enabled=1 AND p.enabled=1) ORDER BY tenant_position,COALESCE(last_slot,''),created_at LIMIT 100",
  );
  let admissions = 0;
  for (const s of schedules) {
    if (admissions >= 100) break;
    const slot = scheduleDue(s, new Date(t));
    if (!slot) continue;
    try {
      const repetitions = Number(s.repetitions);
      for (let sample=1;sample<=repetitions;sample++) {
        if (admissions++ >= 100) throw new Error("Continue admissions next cron");
        await createRun(env, String(s.org_id), String(s.prompt_id), `schedule:${s.id}:${slot}:sample:${sample}`);
      }
      await exec(
        env,
        "UPDATE schedules SET last_slot=? WHERE id=?",
        slot,
        s.id,
      );
    } catch {
      /* Monthly allowance or credentials may block admission. The next sweep reuses the run identity. */
    }
  }
  for (const r of await all(
    env,
    "SELECT id FROM (SELECT id,created_at,ROW_NUMBER() OVER (PARTITION BY org_id ORDER BY created_at) AS tenant_position FROM runs WHERE status='queued' AND workflow_started=0) ORDER BY tenant_position,created_at LIMIT 8",
  ))
    await launchRun(env, String(r.id));
  for (const r of await all(
    env,
    "SELECT * FROM runs WHERE status='submitted' AND updated_at<? ORDER BY updated_at LIMIT 12",
    t - 60 * 1000,
  ))
    await collectRun(env, r);
  await exec(
    env,
    "DELETE FROM request_limits WHERE bucket<?",
    Math.floor(t / 60000) - 120,
  );
}
