import { getPromptReceipt } from "./prompt-batch";
import {z} from 'zod';import {all,exec,HttpError,now,one,required,uuid,type Env,type Row} from './types';import {organizationPlan} from './plans';import {credentials,type Engine} from './provider';import {assertProviderOptions} from './provider-options';import {hashToken} from './crypto';
import { prepareRunAdmission, runUsage, runUsagePeriods } from './run-admission';
import { trackedWorkspaceBrands } from './workspace-brands';
import { nextScheduleSlot } from '../lib/schedule-slots';
import { editedScheduleTimes, scheduleDays } from '../lib/schedule-settings';
import { MAX_COLLECTION_PROMPTS, RUNS_PER_REQUEST } from '../lib/collection-limits';
const selectedIds = z.array(z.string().min(1).max(100)).min(1);
const ids = selectedIds.max(100);
const collectionIds = selectedIds.max(MAX_COLLECTION_PROMPTS);
export const bulkReadinessSchema = z.object({prompt_ids: collectionIds, repetitions: z.number().int().min(1).max(10).default(1)}).strict();
export const bulkPromptIdsSchema = z.object({ ids }).strict();
export const movePromptsSchema = bulkPromptIdsSchema.extend({ workspace_id: z.string().min(1).max(100) });
export const MAX_BULK_SELECTION_REQUEST_BYTES = 64 * 1024;
export const bulkRunSchema = z.object({
 prompt_ids: collectionIds,
 repetitions: z.number().int().min(1).max(10).default(1),
 batch_key: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
 include_runs: z.boolean().default(true),
 receipt_id: z.uuid().optional(),
 expected_workspace_id: z.string().min(1).max(100).optional(),
}).strict();
export const bulkScheduleSchema=z.object({prompt_ids:collectionIds,only_unscheduled:z.boolean().default(false),batch_id:z.uuid().optional(),name:z.string().trim().max(100).default('Scheduled prompts'),preset:z.enum(['daily','weekly','mwf','custom']),days:z.array(z.number().int().min(0).max(6)).min(1).max(7),times:z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(8),timezone:z.string().min(1).max(100),repetitions:z.number().int().min(1).max(10).default(1),enabled:z.boolean().default(false)}).strict();
export async function selectedRows(env:Env,org:string,table:'prompts'|'schedules',selected:string[],limit:number|null=100){
 const unique=[...new Set(selected)];
 if (!unique.length) throw new HttpError(400, 'Choose at least one item');
 if (limit !== null && unique.length > limit) throw new HttpError(400, `Choose 1–${limit} items`);
 const rows=await all<Row>(env,`SELECT * FROM ${table} WHERE org_id=? AND id IN (SELECT value FROM json_each(?))${table === 'prompts' ? ' AND archived_at IS NULL' : ''}`,org,JSON.stringify(unique));
 if(rows.length!==unique.length)throw new HttpError(404,'One or more selected items are not in this organization');return rows;
}
export async function collectionReadiness(env: Env, org: string, input: unknown) {
 const b = bulkReadinessSchema.parse(input);
 const prompts = await selectedRows(env, org, "prompts", b.prompt_ids, null);
 const workspaceId = String(prompts[0].workspace_id);
 if (prompts.some(prompt => prompt.workspace_id !== workspaceId)) throw new HttpError(400, "Choose prompts from one workspace");
 const workspace = required(await one<{ id: string; name: string }>(env,
  "SELECT id,name FROM workspaces WHERE org_id=? AND id=? AND archived_at IS NULL", org, workspaceId));
 const [plan, usage, provider, brands, schedules] = await Promise.all([
  organizationPlan(env, org), runUsage(env, org, runUsagePeriods(now())), credentials(env, org),
  trackedWorkspaceBrands(env, org, workspaceId),
  all<{ id: string; prompt_id: string; enabled: number; days: string; times_json: string; repetitions: number }>(env,
   `SELECT id,prompt_id,enabled,days,times_json,repetitions FROM schedules
    WHERE org_id=? AND prompt_id IN (SELECT value FROM json_each(?))`, org, JSON.stringify(b.prompt_ids)),
 ]);
 const schedulesByPrompt = new Map<string, typeof schedules>();
 for (const schedule of schedules) {
  const existing = schedulesByPrompt.get(schedule.prompt_id);
  if (existing) existing.push(schedule);
  else schedulesByPrompt.set(schedule.prompt_id, [schedule]);
 }
 const available = Math.max(0, plan.limits.runs_per_month - (usage?.monthly ?? 0));
 const optionProblems = new Map<string, string | null>();
 const combinations = await Promise.all(prompts.map(async ({id, text, engine, location_name, language_code, mode, brand_id}) => {
  const key = JSON.stringify([engine, location_name, language_code]);
  let problem = optionProblems.get(key);
  if (problem === undefined) {
   try { await assertProviderOptions([engine as Engine], String(location_name), String(language_code)); problem = null; }
   catch (error) {
    if (!(error instanceof HttpError)) throw error;
    problem = error.message;
   }
   optionProblems.set(key, problem);
  }
  const saved = schedulesByPrompt.get(String(id)) ?? [];
  const monitoring = saved.some(schedule => schedule.enabled) ? "active" : saved.length ? "paused" : "none";
  const pausedSchedules = monitoring === "paused" ? saved.map(schedule => ({
   id: schedule.id, weekly_checks: (JSON.parse(schedule.days) as number[]).length
    * (JSON.parse(schedule.times_json) as string[]).length * schedule.repetitions,
  })) : [];
  return { id, text, engine, location_name, language_code, mode, brand_id,
   monitoring, paused_schedules: pausedSchedules, eligibility_error: problem };
 }));
 return { workspace, brands, combinations, available, requested: prompts.length * b.repetitions,
  provider_connected: Boolean(provider.login && provider.password) };
}

type BatchRun = { id: string; workspace_id: string; status: string; has_answer: number };

export async function readRunBatch(env: Env, org: string, key: string) {
 const batch = await one<{ workspace_id: string; requested: number }>(env,
  "SELECT workspace_id,requested FROM run_batches WHERE org_id=? AND batch_key=?", org, key);
 if (!batch) throw new HttpError(404, "Run batch not found");
 const runs = await all<BatchRun>(env, `SELECT id,prompt_id,prompt_text,workspace_id,status,has_answer,(json_array_length(organic_results)>0) AS has_organic,error,created_at,
   json_extract(config,'$.engine') AS engine FROM runs
   WHERE org_id=? AND idempotency_key>=? AND idempotency_key<? AND json_extract(config,'$.batch_key')=?
   ORDER BY prompt_text,engine,idempotency_key`, org, `bulk:${key}:`, `bulk:${key};`, key);
 const counts = { pending: 0, failed: 0, uncertain: 0, no_answer: 0, eligible: 0 };
 for (const run of runs) {
  if (run.status === "failed") counts.failed++;
  else if (run.status === "uncertain") counts.uncertain++;
  else if (run.status === "succeeded") counts[run.has_answer ? "eligible" : "no_answer"]++;
  else counts.pending++;
 }
 return { batch_key: key, workspace_id: batch.workspace_id ?? runs[0]?.workspace_id,
  requested: batch.requested ?? runs.length, counts, runs };
}

export async function createBulkRuns(env:Env,org:string,input:unknown){
 const b=bulkRunSchema.parse(input),selected=[...new Set(b.prompt_ids)].sort();
 const total=selected.length*b.repetitions;
 const prefix = `bulk:${b.batch_key}:`;
 const prefixEnd = `bulk:${b.batch_key};`;
 const payloadHash=await hashToken(JSON.stringify({selected,repetitions:b.repetitions}));const prior=await one<{payload_hash: string; workspace_id: string | null; receipt_id: string | null}>(env,'SELECT payload_hash,workspace_id,receipt_id FROM run_batches WHERE org_id=? AND batch_key=?',org,b.batch_key);if(prior && prior.payload_hash!==payloadHash)throw new HttpError(409,'This batch key belongs to a different request');
 if (prior?.receipt_id && prior.receipt_id !== b.receipt_id) throw new HttpError(409, "This batch belongs to a different prompt receipt");
 if (b.receipt_id && !prior) {
  const receipt = await getPromptReceipt(env, org, b.receipt_id);
  const received = new Set(receipt.prompts.map(prompt => prompt.id));
  if (selected.some(id => !received.has(id))) throw new HttpError(409, "Choose prompt combinations from this receipt");
 }
 const existing = required(await one<{ admitted: number; available: number }>(env,
   `SELECT count(*) AS admitted,count(r.id) AS available FROM run_admissions a
     LEFT JOIN runs r ON r.org_id=a.org_id AND r.idempotency_key=a.idempotency_key AND json_extract(r.config,'$.batch_key')=?
     WHERE a.org_id=? AND a.idempotency_key>=? AND a.idempotency_key<?`,
   b.batch_key,org,prefix,prefixEnd,
 ));
 if (existing.admitted > existing.available)
   throw new HttpError(410, 'Some results from this batch are no longer available. Its batch key cannot be reused.');
 const needed=total-existing.admitted;
 let workspace = prior?.workspace_id ?? null;
 if (needed > 0) {
  const rows=await selectedRows(env,org,'prompts',selected,null);
  const plan=await organizationPlan(env,org);
  const periods = runUsagePeriods(now());
  const usage = await runUsage(env, org, periods);
  if (usage?.plan_version_id !== plan.version)
    throw new HttpError(409, 'Organization plan changed. Retry the request.');
  if (needed > 0 && usage.monthly + needed > plan.limits.runs_per_month) {
   const remaining = Math.max(0, plan.limits.runs_per_month - usage.monthly);
   throw new HttpError(429, `This batch needs ${needed} new runs. You have ${remaining} runs left in this month's allowance.`);
  }
  workspace=String(rows[0].workspace_id);
  if ((b.expected_workspace_id && b.expected_workspace_id !== workspace) || (prior?.workspace_id && prior.workspace_id !== workspace))
   throw new HttpError(409,'The selected prompts changed workspace');
  if(rows.some(p=>p.workspace_id!==workspace))throw new HttpError(400,'Run one workspace per batch');
  const c=await credentials(env,org);if(!c.login||!c.password)throw new HttpError(409,'Configure DataForSEO credentials in Settings before running a batch');
  for(const p of rows)await assertProviderOptions([p.engine as Engine],String(p.location_name),String(p.language_code));
  await exec(env,'INSERT OR IGNORE INTO run_batches(org_id,batch_key,payload_hash,created_at,workspace_id,requested,receipt_id) VALUES(?,?,?,?,?,?,?)',
   org,b.batch_key,payloadHash,periods.timestamp,workspace,total,b.receipt_id ?? null);
  const stored=await one(env,'SELECT payload_hash,workspace_id,receipt_id FROM run_batches WHERE org_id=? AND batch_key=?',org,b.batch_key);
  if(stored?.payload_hash!==payloadHash || stored.receipt_id !== (b.receipt_id ?? null) || (stored.workspace_id && stored.workspace_id!==workspace))
   throw new HttpError(409,'Batch key conflict or the selected prompts changed workspace');
  const organization=await one<Row>(env,'SELECT resolve_poisoned_results FROM organizations WHERE id=?',org);
  const brands=await trackedWorkspaceBrands(env,org,workspace);
  const promptsById = new Map(rows.map(row => [row.id, row]));
  const pageSize = Math.floor(RUNS_PER_REQUEST / b.repetitions);
  for (let offset = 0; offset < selected.length; offset += pageSize) {
   const statements = [];
   for (const id of selected.slice(offset, offset + pageSize)) {
    const p = promptsById.get(id)!;
    for (let sample = 1; sample <= b.repetitions; sample++) {
     const config={engine:p.engine,mode:p.mode,location_name:p.location_name,language_code:p.language_code,resolve_poisoned_results:!!organization?.resolve_poisoned_results,brands,sample_index:sample,sample_count:b.repetitions,batch_key:b.batch_key};
     statements.push(prepareRunAdmission(env, {
      org, prompt: id, workspace, text: String(p.text), config, key: `${prefix}${id}:${sample}`,
     }, periods, plan));
    }
   }
   await env.DB.batch(statements);
  }
 }
 const batchWhere = "FROM runs WHERE org_id=? AND idempotency_key>=? AND idempotency_key<? AND json_extract(config,'$.batch_key')=?";
 const args = [org, prefix, prefixEnd, b.batch_key];
 const runs = b.include_runs
  ? await all<Row>(env, `SELECT * ${batchWhere} ORDER BY prompt_id,idempotency_key`, ...args)
  : [];
 const accepted = b.include_runs ? runs.length : (await one<{count:number}>(env, `SELECT count(*) AS count ${batchWhere}`, ...args))?.count ?? 0;
 const dispatchIds = await all<{id:string}>(env, `SELECT id ${batchWhere} AND workflow_started=0 AND status IN ('queued','submitted') ORDER BY prompt_id,idempotency_key LIMIT ${RUNS_PER_REQUEST}`, ...args);
 return {runs,batch_key:b.batch_key,workspace_id:workspace,accepted,requested:total,complete:accepted===total,dispatchIds:dispatchIds.map(run=>run.id),...(accepted<total?{error:'Your available allowance or selected prompts changed. Retry the same batch key to queue any missing runs.'}:{})};
}
export async function createBulkSchedules(env:Env,org:string,input:unknown){
 const b=bulkScheduleSchema.parse(input);
 const rows=await selectedRows(env,org,'prompts',b.prompt_ids,null);
 try{new Intl.DateTimeFormat('en',{timeZone:b.timezone}).format();}catch{throw new HttpError(400,'Choose a valid timezone');}
 const days = scheduleDays(b.preset, b.days);
 const times = [...new Set(b.times)].sort();
 const batch = b.batch_id ?? uuid();
 const t = now();
 const scheduleIds = b.batch_id
  ? await Promise.all(rows.map(p => hashToken(JSON.stringify([org, batch, p.id]))))
  : rows.map(() => uuid());
 const getSaved = () => all<{id:string; enabled:number; next_due_at:number|null}>(env,
  "SELECT id,enabled,next_due_at FROM schedules WHERE org_id=? AND id IN (SELECT value FROM json_each(?))", org, JSON.stringify(scheduleIds));
 const existing = b.batch_id ? await getSaved() : [];
 if (b.enabled && existing.length < scheduleIds.length) {
  const provider = await credentials(env, org);
  if (!provider.login || !provider.password) throw new HttpError(409, "Connect DataForSEO before starting monitoring");
 }
 const nextDue = b.enabled ? nextScheduleSlot({days,times,timezone:b.timezone},t) : null;
 const items = rows.map((prompt, index) => ({ prompt: prompt.id, id: scheduleIds[index] }));
 if (existing.length < scheduleIds.length) await exec(env, `INSERT OR IGNORE INTO schedules(id,org_id,prompt_id,preset,days,timezone,enabled,created_at,batch_id,batch_name,times_json,repetitions,next_due_at)
  SELECT json_extract(item.value,'$.id'),?,json_extract(item.value,'$.prompt'),?,?,?,?,?,?,?,?,?,?
  FROM json_each(?) item
  WHERE NOT ? OR NOT EXISTS (SELECT 1 FROM schedules WHERE org_id=? AND prompt_id=json_extract(item.value,'$.prompt'))`,
  org,b.preset,JSON.stringify(days),b.timezone,Number(b.enabled),t,batch,b.name,JSON.stringify(times),b.repetitions,nextDue,
  JSON.stringify(items), Number(b.only_unscheduled), org);
 const saved = existing.length === scheduleIds.length ? existing : await getSaved();
 return {batch_id:batch,schedule_ids:saved.map(row=>row.id),schedules:saved,prompts:saved.length,
  runs_per_time:saved.length*b.repetitions,runs_per_scheduled_day:saved.length*b.repetitions*times.length,enabled:b.enabled};
}

export const bulkScheduleUpdateSchema=z.object({ids:selectedIds,enabled:z.boolean().optional(),preset:z.enum(['daily','weekly','mwf','custom']).optional(),days:z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),times:z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(8).optional(),first_time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),timezone:z.string().min(1).max(100).optional(),repetitions:z.number().int().min(1).max(10).optional()}).strict().refine(b=>Object.keys(b).length>1,'Choose settings to update')
 .refine(b=>!(b.times && b.first_time),'Choose either the first time or the complete time-slot list');
export async function updateBulkSchedules(env:Env,org:string,input:unknown){
 const b=bulkScheduleUpdateSchema.parse(input);
 const rows=await selectedRows(env,org,'schedules',b.ids,null);
 if (b.enabled && rows.some(row => !row.enabled)) {
  const provider = await credentials(env, org);
  if (!provider.login || !provider.password) throw new HttpError(409, "Connect DataForSEO before resuming monitoring");
  await selectedRows(env, org, "prompts", rows.map(row => String(row.prompt_id)), null);
 }
 if(b.timezone)try{new Intl.DateTimeFormat('en',{timeZone:b.timezone}).format();}catch{throw new HttpError(400,'Choose a valid timezone');}
 const changedTiming = b.first_time !== undefined || b.times !== undefined || b.timezone !== undefined || b.days !== undefined || b.preset !== undefined;
 const time = now();
 await env.DB.batch(rows.map(row=>{
  const timezone=b.timezone??String(row.timezone),preset=b.preset??String(row.preset);
  const days=(b.days || b.preset) ? scheduleDays(preset,b.days??JSON.parse(String(row.days))) : JSON.parse(String(row.days)) as number[];
  const currentTimes=JSON.parse(String(row.times_json)) as string[];
  const times=b.times || b.first_time ? editedScheduleTimes(currentTimes,b) : currentTimes;
  const enabled=b.enabled??!!row.enabled;
  const next = enabled ? (!row.enabled || changedTiming
    ? nextScheduleSlot({days,times,timezone},time,changedTiming ? null : row.last_slot as string | null)
    : row.next_due_at) : null;
  const changes: Record<string, unknown> = {};
  if (b.preset !== undefined) changes.preset = preset;
  if (b.preset !== undefined || b.days !== undefined) changes.days = JSON.stringify(days);
  if (b.timezone !== undefined) changes.timezone = timezone;
  if (b.times !== undefined || b.first_time !== undefined) changes.times_json = JSON.stringify(times);
  if (b.repetitions !== undefined) changes.repetitions = b.repetitions;
  if (b.enabled !== undefined) changes.enabled = Number(enabled);
  if (b.enabled !== undefined || changedTiming) {
   changes.next_due_at = next;
   changes.retry_at = 0;
  }
  return env.DB.prepare(`UPDATE schedules SET ${Object.keys(changes).map(key => key + "=?").join(",")}
    WHERE org_id=? AND id=?`).bind(...Object.values(changes), org, row.id);
 }));return {updated:rows.length};
}
