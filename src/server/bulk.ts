import {z} from 'zod';import {all,exec,HttpError,now,one,required,uuid,type Env,type Row} from './types';import {organizationPlan} from './plans';import {credentials,type Engine} from './provider';import {assertProviderOptions} from './provider-options';import {hashToken} from './crypto';
import { prepareRunAdmission, runUsage, runUsagePeriods } from './run-admission';
import { trackedWorkspaceBrands } from './workspace-brands';
const ids=z.array(z.string().min(1).max(100)).min(1).max(100);
export const bulkRunSchema=z.object({prompt_ids:ids,repetitions:z.number().int().min(1).max(10).default(1),batch_key:z.string().regex(/^[A-Za-z0-9_-]{8,100}$/)}).strict();
export const bulkScheduleSchema=z.object({prompt_ids:ids,name:z.string().trim().max(100).default('Scheduled prompts'),preset:z.enum(['daily','weekly','mwf','custom']),days:z.array(z.number().int().min(0).max(6)).min(1).max(7),times:z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(8),timezone:z.string().min(1).max(100),repetitions:z.number().int().min(1).max(10).default(1),enabled:z.boolean().default(false)}).strict();
export const bulkToggleSchema=z.object({ids,enabled:z.boolean().optional(),mode:z.enum(["standard","priority","live"]).optional()}).strict().refine(b=>b.enabled!==undefined||b.mode!==undefined,"Choose settings to update");
export async function selectedRows(env:Env,org:string,table:'prompts'|'schedules',selected:string[]){
 const unique=[...new Set(selected)];if(!unique.length||unique.length>100)throw new HttpError(400,'Choose 1–100 items');
 const rows=await all<Row>(env,`SELECT * FROM ${table} WHERE org_id=? AND id IN (SELECT value FROM json_each(?))${table === 'prompts' ? ' AND archived_at IS NULL' : ''}`,org,JSON.stringify(unique));
 if(rows.length!==unique.length)throw new HttpError(404,'One or more selected items are not in this organization');return rows;
}
export async function createBulkRuns(env:Env,org:string,input:unknown){
 const b=bulkRunSchema.parse(input),selected=[...new Set(b.prompt_ids)].sort();const rows=await selectedRows(env,org,'prompts',selected);
 if(rows.some(p=>!p.enabled))throw new HttpError(409,'Enable all selected prompts before running them');
 const total=selected.length*b.repetitions;if(total>100)throw new HttpError(400,'A batch can queue at most 100 independent runs');
 const plan=await organizationPlan(env,org);if(plan.family==='pending')throw new HttpError(402,'Choose a plan to start tracking');
 const prefix = `bulk:${b.batch_key}:`;
 const prefixEnd = `bulk:${b.batch_key};`;
 const payloadHash=await hashToken(JSON.stringify({selected,repetitions:b.repetitions}));const prior=await one(env,'SELECT payload_hash FROM run_batches WHERE org_id=? AND batch_key=?',org,b.batch_key);if(prior && prior.payload_hash!==payloadHash)throw new HttpError(409,'This batch key belongs to a different request');
 const existing = required(await one<{ admitted: number; available: number }>(env,
   `SELECT count(*) AS admitted,count(r.id) AS available FROM run_admissions a
     LEFT JOIN runs r ON r.org_id=a.org_id AND r.idempotency_key=a.idempotency_key
     WHERE a.org_id=? AND a.idempotency_key>=? AND a.idempotency_key<?`,
   org,prefix,prefixEnd,
 ));
 if (existing.admitted > existing.available)
   throw new HttpError(410, 'Some results from this batch are no longer available. Its batch key cannot be reused.');
 const periods = runUsagePeriods(now());
 const usage = await runUsage(env, org, periods);
 if (usage?.plan_version_id !== plan.version)
   throw new HttpError(409, 'Organization plan changed. Retry the request.');
 const needed=total-existing.admitted;
 if (needed > 0 && usage.monthly + needed > plan.limits.runs_per_month) {
  const remaining = Math.max(0, plan.limits.runs_per_month - usage.monthly);
  throw new HttpError(429, `This batch needs ${needed} new runs. You have ${remaining} runs left in this month's allowance.`);
 }
 await exec(env,'INSERT OR IGNORE INTO run_batches VALUES(?,?,?,?)',org,b.batch_key,payloadHash,periods.timestamp);
 const stored=await one(env,'SELECT payload_hash FROM run_batches WHERE org_id=? AND batch_key=?',org,b.batch_key);if(stored?.payload_hash!==payloadHash)throw new HttpError(409,'Batch key conflict');
 const workspace=String(rows[0].workspace_id);
 if(rows.some(p=>p.workspace_id!==workspace))throw new HttpError(400,'Run one workspace per batch');
 const c=await credentials(env,org);if(!c.login||!c.password)throw new HttpError(409,'Configure DataForSEO credentials in Settings before running a batch');
 for(const p of rows)await assertProviderOptions([p.engine as Engine],String(p.location_name),String(p.language_code));
 const organization=await one<Row>(env,'SELECT resolve_poisoned_results FROM organizations WHERE id=?',org);
 const brands=await trackedWorkspaceBrands(env,org,workspace);
 const statements=[];
 for(const id of selected){const p=rows.find(row=>row.id===id)!;for(let sample=1;sample<=b.repetitions;sample++){
  const config={engine:p.engine,mode:p.mode,location_name:p.location_name,language_code:p.language_code,resolve_poisoned_results:!!organization?.resolve_poisoned_results,brands,sample_index:sample,sample_count:b.repetitions,batch_key:b.batch_key};
  statements.push(prepareRunAdmission(env, {
   org, prompt: id, workspace, text: String(p.text), config, key: `${prefix}${id}:${sample}`,
  }, periods, plan));
 }}
 await env.DB.batch(statements);
 const accepted=await all<Row>(env,'SELECT * FROM runs WHERE org_id=? AND idempotency_key>=? AND idempotency_key<? ORDER BY prompt_id,idempotency_key',org,prefix,prefixEnd);
 return {runs:accepted,requested:total,complete:accepted.length===total,...(accepted.length<total?{error:'Your available allowance changed while the batch was being prepared. Only the listed runs were queued; retry the same batch key safely.'}:{})};
}
export async function createBulkSchedules(env:Env,org:string,input:unknown){
 const b=bulkScheduleSchema.parse(input);const rows=await selectedRows(env,org,'prompts',b.prompt_ids);
 if(rows.length*b.repetitions>100)throw new HttpError(400,'Use at most 100 prompt/sample combinations per scheduled batch');
 try{new Intl.DateTimeFormat('en',{timeZone:b.timezone}).format();}catch{throw new HttpError(400,'Choose a valid timezone');}
 const days=b.preset==='daily'?[0,1,2,3,4,5,6]:b.preset==='mwf'?[1,3,5]:b.preset==='weekly'?[b.days[0]]:[...new Set(b.days)];const times=[...new Set(b.times)].sort(),batch=uuid(),t=now();
 await env.DB.batch(rows.map(p=>env.DB.prepare('INSERT INTO schedules(id,org_id,prompt_id,preset,days,timezone,enabled,created_at,batch_id,batch_name,times_json,repetitions) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(uuid(),org,p.id,b.preset,JSON.stringify(days),b.timezone,Number(b.enabled),t,batch,b.name,JSON.stringify(times),b.repetitions)));
 return {batch_id:batch,prompts:rows.length,runs_per_time:rows.length*b.repetitions,runs_per_scheduled_day:rows.length*b.repetitions*times.length,enabled:b.enabled};
}

export const bulkScheduleUpdateSchema=z.object({ids,enabled:z.boolean().optional(),preset:z.enum(['daily','weekly','mwf','custom']).optional(),days:z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),times:z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(8).optional(),timezone:z.string().min(1).max(100).optional(),repetitions:z.number().int().min(1).max(10).optional()}).strict().refine(b=>Object.keys(b).length>1,'Choose settings to update');
export async function updateBulkSchedules(env:Env,org:string,input:unknown){
 const b=bulkScheduleUpdateSchema.parse(input);const rows=await selectedRows(env,org,'schedules',b.ids);
 if (b.enabled !== undefined && Object.keys(b).length === 2) {
  await env.DB.batch(rows.map(row =>
   env.DB.prepare('UPDATE schedules SET enabled=? WHERE org_id=? AND id=?').bind(Number(b.enabled),org,row.id),
  ));
  return {updated:rows.length};
 }
 if(b.timezone)try{new Intl.DateTimeFormat('en',{timeZone:b.timezone}).format();}catch{throw new HttpError(400,'Choose a valid timezone');}
 const {localSlot}=await import('./scheduler');
 await env.DB.batch(rows.map(row=>{
  const timezone=b.timezone||String(row.timezone),preset=b.preset||String(row.preset);
  const chosenDays=b.days||JSON.parse(String(row.days));const days=preset==='daily'?[0,1,2,3,4,5,6]:preset==='mwf'?[1,3,5]:preset==='weekly'?[chosenDays[0]]:[...new Set(chosenDays)];
  const times=b.times?[...new Set(b.times)].sort():JSON.parse(String(row.times_json)) as string[];
  const slot=localSlot(new Date(),timezone),due=times.filter(time=>time<=slot.time).at(-1);
  // Timing edits start with FUTURE slots, never retroactively charging for elapsed times.
  const last=(b.times||b.timezone) && due?`${slot.date}@${due}`:row.last_slot;
  return env.DB.prepare('UPDATE schedules SET preset=?,days=?,timezone=?,times_json=?,repetitions=?,enabled=?,last_slot=? WHERE org_id=? AND id=?').bind(preset,JSON.stringify(days),timezone,JSON.stringify(times),b.repetitions??row.repetitions,b.enabled===undefined?row.enabled:Number(b.enabled),last??null,org,row.id);
 }));return {updated:rows.length};
}
