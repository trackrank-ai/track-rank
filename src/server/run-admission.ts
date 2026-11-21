import { calendarMonth } from "./plans";
import { one, uuid, type Env } from "./types";

export function runUsagePeriods(timestamp: number) {
  const day = new Date(timestamp).toISOString().slice(0, 10);
  return { timestamp, day, dayStart: Date.parse(day), month: calendarMonth(timestamp) };
}

export function runUsage(env: Env, org: string, periods: ReturnType<typeof runUsagePeriods>) {
  return one<{ daily: number; monthly: number; plan_version_id: string }>(env,
    `SELECT coalesce(daily.runs,0) AS daily, coalesce(monthly.runs,0) AS monthly, a.plan_version_id
      FROM organizations o JOIN organization_plans a ON a.org_id=o.id
      LEFT JOIN run_usage daily ON daily.org_id=o.id AND daily.period=?
      LEFT JOIN run_usage monthly ON monthly.org_id=o.id AND monthly.period=?
      WHERE o.id=?`,
    periods.day, periods.month.key, org,
  );
}

export function prepareRunAdmission(env: Env, run: {
  org: string;
  prompt: string;
  workspace: string;
  text: string;
  config: object;
  key: string;
}, periods: ReturnType<typeof runUsagePeriods>, plan: { version: string; limits: { runs_per_month: number } }) {
  // The trigger records each inserted row before the next admission can inspect quota.
  return env.DB.prepare(`INSERT OR IGNORE INTO runs
    (id,org_id,prompt_id,workspace_id,prompt_text,config,status,idempotency_key,created_at,updated_at)
    SELECT ?,o.id,?,?,?,?,'queued',?,?,?
    FROM organizations o JOIN organization_plans a ON a.org_id=o.id
    LEFT JOIN run_usage monthly ON monthly.org_id=o.id AND monthly.period=?
    WHERE o.id=? AND a.plan_version_id=?
      AND coalesce(monthly.runs,0)<?`).bind(
    uuid(), run.prompt, run.workspace, run.text, JSON.stringify(run.config),
    run.key, periods.timestamp, periods.timestamp, periods.month.key,
    run.org, plan.version, plan.limits.runs_per_month,
  );
}
