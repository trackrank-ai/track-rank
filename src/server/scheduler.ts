import { all, HttpError, now, type Env, type Row } from "./types";
import { collectRun, credentials } from "./provider";
import { launchRuns, recoverQueuedWorkflows, WORKFLOW_BATCH_SIZE } from "./dispatch";
import { localSlot, nextScheduleSlot } from "../lib/schedule-slots";
import { organizationPlan } from "./plans";
import { trackedWorkspaceBrands } from "./workspace-brands";
import { prepareRunAdmission, runUsagePeriods } from "./run-admission";

export { localSlot } from "../lib/schedule-slots";

function slotSettings(row: Row) {
  return { timezone: String(row.timezone), days: JSON.parse(String(row.days)) as number[], times: JSON.parse(String(row.times_json)) as string[] };
}

export async function admitDueSchedules(env: Env, time: number) {
  const deadline = now() + 25_000;
  const periods = runUsagePeriods(time);
  const plans = new Map<string, Awaited<ReturnType<typeof organizationPlan>> | null>();
  const hasCredentials = new Map<string, boolean>();
  const brands = new Map<string, Row[]>();
  const existing = await all(env, `
    SELECT s.* FROM schedules s JOIN prompts p ON p.org_id=s.org_id AND p.id=s.prompt_id
    WHERE s.enabled=1 AND p.enabled=1 AND p.archived_at IS NULL AND s.next_due_at IS NULL
    ORDER BY s.id LIMIT 1600
  `);
  if (existing.length) {
    await env.DB.batch(existing.map(row => {
      const settings = slotSettings(row);
      const today = localSlot(new Date(time), settings.timezone).date;
      const next = nextScheduleSlot(settings, Math.max(Number(row.created_at) - 1, Number(row.eligible_after), time - 26 * 3600_000), row.last_slot as string | null, today);
      return env.DB.prepare("UPDATE schedules SET next_due_at=? WHERE id=? AND enabled=1 AND next_due_at IS NULL AND days=? AND times_json=? AND timezone=? AND eligible_after=?")
        .bind(next, row.id, row.days, row.times_json, row.timezone, row.eligible_after);
    }));
  }

  // Bound total work per invocation, but choose only due cursors. Backlogged slots remain indexed.
  for (let page = 0; page < 16 && now() < deadline; page++) {
    const rows = await all(env, `
      SELECT * FROM (
        SELECT s.*,p.workspace_id,p.text,p.engine,p.mode,p.location_name,p.language_code,o.resolve_poisoned_results,
          ROW_NUMBER() OVER(PARTITION BY s.org_id ORDER BY s.next_due_at,s.id) AS tenant_position
        FROM schedules s JOIN prompts p ON p.org_id=s.org_id AND p.id=s.prompt_id JOIN organizations o ON o.id=s.org_id
        WHERE s.enabled=1 AND p.enabled=1 AND p.archived_at IS NULL AND s.next_due_at<=? AND s.retry_at<=?
      ) ORDER BY tenant_position,next_due_at,id LIMIT 100
    `, time, time);
    if (!rows.length) break;
    const writes = [];
    for (const row of rows) {
      const settings = slotSettings(row);
      const due = Number(row.next_due_at);
      const local = localSlot(new Date(due), settings.timezone);
      const today = localSlot(new Date(time), settings.timezone).date;
      const slot = `${local.date}@${local.time}`;
      const org = String(row.org_id), workspace = String(row.workspace_id);
      const repetitions = Number(row.repetitions);
      if (local.date === today) {
        try {
          if (!plans.has(org)) {
            try { plans.set(org, await organizationPlan(env, org)); }
            catch (error) {
              if (!(error instanceof HttpError) || error.status !== 402) throw error;
              plans.set(org, null);
            }
          }
          if (plans.get(org) && !hasCredentials.has(org)) {
            const saved = await credentials(env, org);
            hasCredentials.set(org, !!(saved.login && saved.password));
          }
          if (hasCredentials.get(org)) {
            if (!brands.has(workspace)) brands.set(workspace, await trackedWorkspaceBrands(env, org, workspace));
            const config = {
              engine: row.engine, mode: row.mode, location_name: row.location_name, language_code: row.language_code,
              resolve_poisoned_results: !!row.resolve_poisoned_results, brands: brands.get(workspace),
            };
            for (let sample = 1; sample <= repetitions; sample++) {
              writes.push(prepareRunAdmission(env, {
                org, workspace, prompt: String(row.prompt_id), text: String(row.text), key: `schedule:${row.id}:${slot}:sample:${sample}`,
                config: { ...config, sample_index: sample, sample_count: repetitions },
                schedule: { id: String(row.id), due, days: String(row.days), times: String(row.times_json), timezone: settings.timezone, repetitions },
              }, periods, plans.get(org)!));
            }
          }
        } catch {
          // Keep this slot eligible after backoff without blocking other tenants.
          writes.push(env.DB.prepare("UPDATE schedules SET retry_at=? WHERE id=? AND next_due_at=? AND enabled=1")
            .bind(time + 60_000, row.id, due));
          continue;
        }
      }
      const next = nextScheduleSlot(settings, local.date === today ? due : time - 26 * 3600_000, slot, today);
      writes.push(env.DB.prepare(`
        UPDATE schedules SET next_due_at=?,last_slot=?,retry_at=0
        WHERE id=? AND enabled=1 AND next_due_at=? AND days=? AND times_json=? AND timezone=? AND repetitions=?
        AND EXISTS(SELECT 1 FROM prompts p WHERE p.org_id=schedules.org_id AND p.id=schedules.prompt_id AND p.enabled=1 AND p.archived_at IS NULL)
      `).bind(next, slot, row.id, due, row.days, row.times_json, row.timezone, repetitions));
    }
    await env.DB.batch(writes);
  }
}

export async function sweep(env: Env) {
  const time = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE runs SET status='uncertain',error='Provider submission outcome uncertain; check your DataForSEO task list before retrying.',updated_at=? WHERE status='submitting' AND updated_at<?").bind(time, time - 10 * 60_000),
    env.DB.prepare("UPDATE runs SET status='failed',error='Provider task exceeded 72 hours; inspect provider task history.',updated_at=? WHERE status='submitted' AND submitted_at<?").bind(time, time - 72 * 3600_000),
    env.DB.prepare("DELETE FROM request_limits WHERE bucket<?").bind(Math.floor(time / 60_000) - 120),
  ]);
  const sweeps = await Promise.allSettled([dispatchDueRuns(env, time), pollAcceptedRuns(env, time)]);
  for (const result of sweeps) if (result.status === "rejected") throw result.reason;
}

async function dispatchDueRuns(env: Env, time: number) {
  await recoverQueuedWorkflows(env, time);
  await admitDueSchedules(env, time);
  for (let batch = 0; batch < 16; batch++) {
    // A partial launch stays eligible for the next sweep. Full batches are spaced
    // to respect Cloudflare's per-Workflow instance creation rate.
    if (await launchRuns(env) < WORKFLOW_BATCH_SIZE) break;
    if (batch < 15) await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function pollAcceptedRuns(env: Env, time: number) {
  const recovery = await all(env, "SELECT * FROM runs WHERE status='submitted' AND poll_after<=? AND poll_lease_until<=? ORDER BY poll_after,id LIMIT 12", time, time);
  const errors: unknown[] = [];
  for (let index = 0; index < recovery.length; index += 4) {
    const results = await Promise.allSettled(recovery.slice(index, index + 4).map(run => collectRun(env, run, 10_000)));
    for (const result of results) if (result.status === "rejected") errors.push(result.reason);
  }
  if (errors.length) throw errors[0];
}
