import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture} from './helpers/billing-fixture';import {seal} from '../src/server/crypto';import {createBulkRuns,createBulkSchedules,updateBulkSchedules} from '../src/server/bulk';import {scheduleDue} from '../src/server/scheduler';
import { createRun } from '../src/server/provider';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { runUsage, runUsagePeriods } from '../src/server/run-admission';
import { sweep } from '../src/server/scheduler';
async function setup(){const f=fixture();f.env.CREDENTIALS_KEY=Buffer.alloc(32,4).toString('base64');f.sql.exec("INSERT INTO workspaces(id,org_id,name,created_at) VALUES('w','org','Space',0);INSERT INTO prompts(id,org_id,workspace_id,text,created_at,updated_at) VALUES('p1','org','w','First question',0,0),('p2','org','w','Second question',0,0)");f.sql.prepare('INSERT INTO credentials VALUES(?,?,1,0)').run('org',await seal(f.env,'org',{login:'test',password:'fixture'}));return f;}
function assignRunLimit(sql: ReturnType<typeof fixture>["sql"], limit: number) {
  const id = "limited-" + limit;
  const caps = JSON.stringify({ api_per_minute: 120, provider_per_minute: 10, runs_per_month: limit });
  sql.prepare("INSERT INTO plan_versions VALUES(?,'test','Limited',0,'usd','month','active',?,0)").run(id,caps);
  sql.prepare("UPDATE organization_plans SET plan_version_id=? WHERE org_id='org'").run(id);
}
test('bulk sampling creates independent runs, replays safely, and rejects changed-payload reuse',async()=>{
 const {env,sql}=await setup();const input={prompt_ids:['p1','p2'],repetitions:5,batch_key:'bulk-test-unique'};const first=await createBulkRuns(env,'org',input);assert.equal(first.runs.length,10);assert.equal(new Set(first.runs.map(r=>r.id)).size,10);assert.ok(first.complete);const again=await createBulkRuns(env,'org',input);assert.deepEqual(again.runs.map(r=>r.id),first.runs.map(r=>r.id));assert.equal(sql.prepare('SELECT count(*) AS n FROM runs').get()?.n,10);await assert.rejects(createBulkRuns(env,'org',{...input,repetitions:2}),/different request/);
});
test('bulk monthly quotas and cross-tenant selections are checked before any partial queueing',async()=>{
 const {env,sql}=await setup();assignRunLimit(sql,3);await assert.rejects(createBulkRuns(env,'org',{prompt_ids:['p1','p2'],repetitions:2,batch_key:'batch-too-large'}),/needs 4 new runs.*3 runs left/);assert.equal(sql.prepare('SELECT count(*) AS n FROM runs').get()?.n,0);await assert.rejects(createBulkRuns(env,'other',{prompt_ids:['p1'],batch_key:'foreign-batch'}),/not in this organization/);
});
test('an 87-run batch is admitted when the monthly allowance is available', async () => {
  const { env, sql } = await setup();
  assignRunLimit(sql, 100);
  const insert = sql.prepare("INSERT INTO prompts(id,org_id,workspace_id,text,created_at,updated_at) VALUES(?,'org','w',?,0,0)");
  const prompt_ids = Array.from({length:87}, (_, i) => "batch-prompt-" + i);
  for (const id of prompt_ids) insert.run(id, "Question " + id);
  const batch = await createBulkRuns(env, "org", { prompt_ids, batch_key:"batch-above-daily-limit" });
  assert.equal(batch.runs.length,87);
  assert.equal(batch.complete,true);
  assert.equal((await runUsage(env,"org",runUsagePeriods(Date.now())))?.monthly,87);
});
test('retrying a partially admitted batch queues only its missing samples', async () => {
  const { env, sql } = await setup();
  const input = { prompt_ids: ['p1', 'p2'], repetitions: 2, batch_key: 'partially-admitted' };
  assignRunLimit(sql,4);
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = (statements) => {
    // Simulate another request consuming two slots after the initial quota check.
    const timestamp = Date.now();
    const insert = sql.prepare(`INSERT INTO runs(id,org_id,prompt_id,workspace_id,prompt_text,config,status,idempotency_key,created_at,updated_at)
      VALUES(?,'org','p1','w','Question','{}','queued',?,?,?)`);
    for (const id of ['concurrent-1', 'concurrent-2']) insert.run(id, id, timestamp, timestamp);
    return batch(statements);
  };
  const partial = await createBulkRuns(env, 'org', input);
  assert.equal(partial.complete, false);
  assert.equal(partial.runs.length, 2);
  env.DB.batch = batch;
  assignRunLimit(sql,20);
  const complete = await createBulkRuns(env, 'org', input);
  assert.equal(complete.complete, true);
  assert.equal(complete.runs.length, 4);
  assert.ok(partial.runs.every(prior => complete.runs.some(run => run.id === prior.id)));
  assert.equal(sql.prepare('SELECT count(*) AS n FROM runs').get()?.n, 6);
});

test('single and bulk admissions share quota and neither deletion nor replay reopens it', async () => {
  const { env, sql } = await setup();
  sql.exec(`INSERT INTO user VALUES('owner','Owner','owner@example.invalid',1,NULL,0,0);
    INSERT INTO memberships VALUES('org','owner','owner',0)`);
  const caps = JSON.stringify({ api_per_minute: 120, provider_per_minute: 10, runs_per_month: 3 });
  sql.prepare("INSERT INTO plan_versions VALUES('limited','test','Limited',0,'usd','month','active',?,0)").run(caps);
  sql.exec("UPDATE organization_plans SET plan_version_id='limited' WHERE org_id='org'");

  const singleKey = 'schedule:example:daily-slot';
  const single = await createRun(env, 'org', 'p1', singleKey);
  const batch = { prompt_ids: ['p2'], repetitions: 2, batch_key: 'before-history-cleanup' };
  const first = await createBulkRuns(env, 'org', batch);
  const replay = await createBulkRuns(env, 'org', batch);
  assert.equal(first.complete, true);
  assert.deepEqual(replay.runs.map(({ id }) => id), first.runs.map(({ id }) => id));

  sql.prepare('DELETE FROM runs WHERE id IN (?,?)').run(String(single.id), String(first.runs[0].id));
  await assert.rejects(createRun(env, 'org', 'p1', singleKey), { status: 410 });
  await assert.rejects(createBulkRuns(env, 'org', batch), { status: 410 });
  await assert.rejects(createRun(env, 'org', 'p1', 'new-single'), { status: 429 });
  await assert.rejects(createBulkRuns(env, 'org', { ...batch, batch_key: 'new-bulk' }), { status: 429 });
  assert.equal(sql.prepare('SELECT count(*) AS n FROM runs').get()?.n, 1);

  const { api } = await import('../src/server/api');
  const settings = await (await api(
    new Request('https://test.example/api/v1/settings?org=org'), env,
    { waitUntil: () => {} } as any, { userId: 'owner', orgId: 'org' },
  )).json() as { usage: { runs: number }; monthly_usage: { runs: number } };
  assert.equal(settings.usage.runs, 3);
  assert.equal(settings.monthly_usage.runs, 3);

  const usage = await runUsage(env, 'org', runUsagePeriods(Number(single.created_at)));
  assert.equal(usage?.daily, 3);
  assert.equal(usage?.monthly, 3);
});
test('batch schedules retain sampling and times through bulk pause/enable; invalid batch does not partially save',async()=>{
 const {env,sql}=await setup();const input={prompt_ids:['p1','p2'],preset:'daily',days:[1],times:['09:00','17:00'],timezone:'UTC',repetitions:5};const made=await createBulkSchedules(env,'org',input);assert.equal(made.runs_per_time,10);assert.equal(made.runs_per_scheduled_day,20);const rows=sql.prepare('SELECT * FROM schedules').all();assert.equal(rows.length,2);assert.ok(rows.every(r=>r.enabled===0));await updateBulkSchedules(env,'org',{ids:rows.map(r=>r.id),enabled:true});const updated=sql.prepare('SELECT * FROM schedules').all();assert.ok(updated.every(r=>r.enabled===1&&r.repetitions===5&&r.times_json==='["09:00","17:00"]'));await assert.rejects(createBulkSchedules(env,'org',{...input,prompt_ids:['p1','foreign']}),/not in this organization/);assert.equal(sql.prepare('SELECT count(*) AS n FROM schedules').get()?.n,2);
});
test('multiple daily slots fire once each; missed slots choose latest rather than bursting historical runs',()=>{
 const row={timezone:'UTC',days:'[0,1,2,3,4,5,6]',times_json:'["09:00","17:00"]',last_slot:null};assert.equal(scheduleDue(row,new Date('2026-11-21T08:00Z')),null);assert.equal(scheduleDue(row,new Date('2026-11-21T09:05Z')),'2026-11-21@09:00');assert.equal(scheduleDue({...row,last_slot:'2026-11-21@09:00'},new Date('2026-11-21T09:10Z')),null);assert.equal(scheduleDue({...row,last_slot:'2026-11-21@09:00'},new Date('2026-11-21T17:00Z')),'2026-11-21@17:00');assert.equal(scheduleDue(row,new Date('2026-11-21T18:00Z')),'2026-11-21@17:00');
});

test('schedule migration recovers admitted daily slots and leaves canonical batches intact', () => {
  const sql = new DatabaseSync(':memory:');
  const migration = '0016_canonical_schedules.sql';
  for (const file of readdirSync('migrations').filter(file => file.endsWith('.sql') && file < migration).sort()) {
    sql.exec(readFileSync('migrations/' + file, 'utf8'));
  }
  sql.exec(`INSERT INTO organizations(id,name,created_at) VALUES('org','Organization',0);
    INSERT INTO workspaces(id,org_id,name,created_at) VALUES('workspace','org','Workspace',0);
    INSERT INTO prompts(id,org_id,workspace_id,text,created_at,updated_at) VALUES('prompt','org','workspace','Question',0,0);
    INSERT INTO schedules(id,org_id,prompt_id,preset,days,local_time,timezone,enabled,last_slot,created_at,batch_id,times_json)
      VALUES('unmarked','org','prompt','daily','[0,1,2,3,4,5,6]','09:00','UTC',1,NULL,0,NULL,'[]'),
      ('marked','org','prompt','daily','[0,1,2,3,4,5,6]','16:00','UTC',0,'2026-11-21',0,NULL,'[]'),
      ('batched','org','prompt','daily','[0,1,2,3,4,5,6]','06:00','UTC',1,'2026-11-21@17:00',0,'batch','["06:00","17:00"]');
    INSERT INTO run_admissions VALUES('org','schedule:unmarked:2026-11-21'),('org','schedule:unmarked-extra:2026-11-22');`);
  sql.exec(readFileSync('migrations/' + migration, 'utf8'));
  const get = sql.prepare('SELECT * FROM schedules WHERE id=?');
  const unmarked = get.get('unmarked')!;
  assert.equal(unmarked.local_time, undefined);
  assert.equal(unmarked.times_json, '["09:00"]');
  assert.equal(unmarked.batch_id, 'unmarked');
  assert.equal(unmarked.last_slot, '2026-11-21@09:00');
  assert.equal(scheduleDue(unmarked, new Date('2026-11-21T18:00Z')), null);
  assert.equal(scheduleDue(unmarked, new Date('2026-11-22T09:00Z')), '2026-11-22@09:00');
  assert.equal(get.get('marked')!.last_slot, '2026-11-21@16:00');
  assert.equal(get.get('marked')!.enabled, 0);
  assert.equal(get.get('batched')!.times_json, '["06:00","17:00"]');
  assert.equal(get.get('batched')!.last_slot, '2026-11-21@17:00');
  assert.equal(sql.prepare('SELECT count(*) AS count FROM run_admissions').get()!.count, 2);
  sql.close();
});

test('bulk pause and enable preserve the last collected slot', async () => {
  const { env, sql } = await setup();
  sql.exec(`INSERT INTO schedules(id,org_id,prompt_id,preset,days,times_json,timezone,enabled,last_slot,created_at,batch_id)
    VALUES('example','org','p1','daily','[0,1,2,3,4,5,6]','["09:00"]','UTC',1,'2026-11-21@09:00',0,'batch')`);
  const readSchedule = () => ({ ...sql.prepare("SELECT * FROM schedules WHERE id='example'").get()! });
  const original = readSchedule();
  await updateBulkSchedules(env, 'org', { ids: ['example'], enabled: false });
  assert.deepEqual(readSchedule(), { ...original, enabled: 0 });
  await updateBulkSchedules(env, 'org', { ids: ['example'], enabled: true });
  assert.deepEqual(readSchedule(), original);
  assert.equal(scheduleDue(readSchedule(), new Date('2026-11-21T18:00Z')), null);
  assert.equal(scheduleDue(readSchedule(), new Date('2026-11-22T09:00Z')), '2026-11-22@09:00');
});

test('a sweep retries a scheduled time slot with the same identity for each sample', async (t) => {
  const { env, sql } = await setup();
  t.mock.method(Date, 'now', () => Date.parse('2026-11-21T09:05Z'));
  env.RUN_WORKFLOW = { create: async () => ({}) } as unknown as typeof env.RUN_WORKFLOW;
  await createBulkSchedules(env, 'org', {
    prompt_ids: ['p1'], preset: 'daily', days: [1], times: ['09:00'], timezone: 'UTC', repetitions: 2, enabled: true,
  });
  const schedule = sql.prepare('SELECT id FROM schedules').get()!;
  const ids = () => sql.prepare('SELECT idempotency_key FROM runs ORDER BY idempotency_key').all().map(row => row.idempotency_key);
  await sweep(env);
  assert.deepEqual(ids(), [1,2].map(sample => `schedule:${schedule.id}:2026-11-21@09:00:sample:${sample}`));
  sql.exec('UPDATE schedules SET last_slot=NULL');
  await sweep(env);
  assert.equal(ids().length, 2);
  assert.equal(sql.prepare('SELECT last_slot FROM schedules').get()!.last_slot, '2026-11-21@09:00');
});

test('run history requires both cursor values and continues through same-timestamp results', async () => {
  const { env, sql } = await setup();
  sql.exec(`INSERT INTO user VALUES('owner','Owner','owner@example.invalid',1,NULL,0,0);
    INSERT INTO memberships VALUES('org','owner','owner',0);
    INSERT INTO workspaces(id,org_id,name,created_at) VALUES('different','org','Different',0);
    INSERT INTO prompts(id,org_id,workspace_id,text,created_at,updated_at) VALUES('different','org','different','Other question',0,0)`);
  const insertRun = sql.prepare(`INSERT INTO runs(id,org_id,prompt_id,workspace_id,prompt_text,config,status,idempotency_key,created_at,updated_at)
    VALUES(?,'org',?,?, 'Question','{}','queued',?,?,0)`);
  const sameTimestamp = 1_000;
  const ids = Array.from({ length: 103 }, (_, i) => `run-${String(i).padStart(3, '0')}`);
  for (const id of ids) insertRun.run(id, 'p1', 'w', id, sameTimestamp);
  insertRun.run('older', 'p1', 'w', 'older', sameTimestamp - 1);
  insertRun.run('unrelated', 'different', 'different', 'unrelated', sameTimestamp);

  const { api } = await import('../src/server/api');
  const list = async (query = '') => (await api(
    new Request('https://test.example/api/v1/runs?org=org&workspace=w' + query),
    env,
    { waitUntil: () => {} } as any,
    { userId: 'owner', orgId: 'org' },
  )).json() as Promise<{ runs: {id: string}[]; next_before: number | null; next_before_id: string | null }>;

  const first = await list();
  assert.equal(first.runs.length, 100);
  assert.equal(first.next_before, sameTimestamp);
  assert.equal(first.next_before_id, 'run-003');
  const second = await list(`&before=${first.next_before}&before_id=${first.next_before_id}`);
  assert.deepEqual(
    [...first.runs, ...second.runs].map(({ id }) => id),
    [...ids.reverse(), 'older'],
  );
  assert.equal(second.next_before, null);
  assert.equal(second.next_before_id, null);
  await assert.rejects(list(`&before=${sameTimestamp}`), /Invalid run history cursor/);
  await assert.rejects(list('&before_id=run-003'), /Invalid run history cursor/);
});
test('bulk prompt settings route is not intercepted by the single-prompt route and retains unspecified settings',async()=>{
 const {env,sql}=await setup();sql.exec("INSERT INTO user VALUES('owner','Owner','owner@example.invalid',1,NULL,0,0);INSERT INTO memberships VALUES('org','owner','owner',0)");
 const {api}=await import('../src/server/api');
 const call=(data:unknown,p={userId:'owner',orgId:'org'})=>api(new Request('https://test.example/api/v1/prompts/bulk-settings?org=org',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),env,{waitUntil:()=>{}} as any,p);
 assert.equal((await call({ids:['p1','p2'],mode:'priority'})).status,200);
 await call({ids:['p1','p2'],enabled:false});
 assert.ok(sql.prepare('SELECT * FROM prompts').all().every(p=>p.enabled===0 && p.mode==='priority'));
 await assert.rejects(call({ids:['p1','foreign'],enabled:true}),/not in this organization/);
 assert.ok(sql.prepare('SELECT * FROM prompts').all().every(p=>p.enabled===0));
});
