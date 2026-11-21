import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture} from './helpers/billing-fixture';import {seal} from '../src/server/crypto';import {createBulkRuns,createBulkSchedules,updateBulkSchedules} from '../src/server/bulk';
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
test('REST queues 500 independent runs, Cron recovers a missed workflow, and replay preserves run IDs', async () => {
  const { env, sql } = await setup();
  assignRunLimit(sql, 500);
  const insert = sql.prepare("INSERT INTO prompts(id,org_id,workspace_id,text,created_at,updated_at) VALUES(?,'org','w',?,0,0)");
  const prompt_ids = Array.from({ length: 250 }, (_, i) => "batch-prompt-" + i);
  for (const id of prompt_ids) insert.run(id, "Question " + id);
  const launches: number[] = [];
  env.RUN_WORKFLOW = { createBatch: async ({ instances }: { instances: { id: string }[] }) => {
    launches.push(instances.length);
    // One instance in the first page fails to start. Subsequent pages still launch.
    return launches.length === 1
      ? { created: instances.slice(1), errors: [{ index: 0, code: 1 }] }
      : { created: instances, errors: [] };
  }} as unknown as typeof env.RUN_WORKFLOW;
  const { api } = await import('../src/server/api');
  const pending: Promise<unknown>[] = [];
  const context = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as unknown as import('../src/server/types').Ctx;
  const payload = { prompt_ids, repetitions: 2, batch_key: 'large-collection' };
  const queue = (input = payload) => api(new Request('https://example.test/api/v1/runs/bulk?org=org', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }), env, context, { userId: 'alice', orgId: 'org' });

  await assert.rejects(queue({ ...payload, repetitions: 3 }), { status: 400 });
  await assert.rejects(queue({ ...payload, prompt_ids: [...prompt_ids.slice(1), 'foreign'] }), { status: 404 });
  assert.equal(sql.prepare('SELECT count(*) AS n FROM runs').get()?.n, 0);
  const response = await queue();
  assert.equal(response.status, 202);
  const batch = await response.json() as { runs: { id: string }[]; complete: boolean; requested: number };
  assert.equal(batch.complete, true);
  assert.equal(batch.requested, 500);
  assert.equal(new Set(batch.runs.map(run => run.id)).size, 500);
  await Promise.all(pending);
  assert.deepEqual(launches, [100, 100, 100, 100, 100]);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM runs WHERE workflow_started=0').get()?.n, 1);

  // Cron can recover the admitted run without another action from the client.
  await sweep(env);
  assert.deepEqual(launches, [100, 100, 100, 100, 100, 1]);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM runs WHERE workflow_started=0').get()?.n, 0);
  const replay = await (await queue()).json() as typeof batch;
  assert.deepEqual(replay.runs.map(run => run.id), batch.runs.map(run => run.id));
  await Promise.all(pending);
  assert.deepEqual(launches, [100, 100, 100, 100, 100, 1]);
  assert.equal((await runUsage(env, 'org', runUsagePeriods(Date.now())))?.monthly, 500);
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
  assert.equal(get.get('marked')!.last_slot, '2026-11-21@16:00');
  assert.equal(get.get('marked')!.enabled, 0);
  assert.equal(get.get('batched')!.times_json, '["06:00","17:00"]');
  assert.equal(get.get('batched')!.last_slot, '2026-11-21@17:00');
  assert.equal(sql.prepare('SELECT count(*) AS count FROM run_admissions').get()!.count, 2);
  sql.close();
});

test('bulk pause and enable preserve the last collected slot', async (t) => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-21T18:00Z'));
  const { env, sql } = await setup();
  sql.exec(`INSERT INTO schedules(id,org_id,prompt_id,preset,days,times_json,timezone,enabled,last_slot,created_at,batch_id)
    VALUES('example','org','p1','daily','[0,1,2,3,4,5,6]','["09:00"]','UTC',1,'2026-11-21@09:00',0,'batch')`);
  const readSchedule = () => ({ ...sql.prepare("SELECT * FROM schedules WHERE id='example'").get()! });
  const original = readSchedule();
  await updateBulkSchedules(env, 'org', { ids: ['example'], enabled: false });
  assert.deepEqual(readSchedule(), { ...original, enabled: 0 });
  await updateBulkSchedules(env, 'org', { ids: ['example'], enabled: true });
  assert.deepEqual(readSchedule(), { ...original, next_due_at: Date.parse('2026-11-22T09:00Z') });
});

test('a sweep retries a scheduled time slot with the same identity for each sample', async (t) => {
  const { env, sql } = await setup();
  let time = Date.parse('2026-11-21T08:55Z');
  t.mock.method(Date, 'now', () => time);
  env.RUN_WORKFLOW = { createBatch: async ({instances}: {instances: {id:string}[]}) => ({created:instances,errors:[]}) } as unknown as typeof env.RUN_WORKFLOW;
  await createBulkSchedules(env, 'org', {
    prompt_ids: ['p1'], preset: 'daily', days: [1], times: ['09:00','09:01'], timezone: 'UTC', repetitions: 2, enabled: true,
  });
  const schedule = sql.prepare('SELECT id FROM schedules').get()!;
  const ids = () => sql.prepare('SELECT idempotency_key FROM runs ORDER BY idempotency_key').all().map(row => row.idempotency_key);
  time = Date.parse('2026-11-21T09:05Z');
  await sweep(env);
  const expected = ['09:00','09:01'].flatMap(slot => [1,2].map(sample => `schedule:${schedule.id}:2026-11-21@${slot}:sample:${sample}`));
  assert.deepEqual(ids(), expected);
  sql.prepare('UPDATE schedules SET next_due_at=?').run(Date.parse('2026-11-21T09:00Z'));
  await sweep(env);
  assert.deepEqual(ids(), expected);
  assert.equal(sql.prepare('SELECT last_slot FROM schedules').get()!.last_slot, '2026-11-21@09:01');
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

test('a busy sweep admits 1500 due slots while 100 earlier non-due schedules remain untouched', async (t) => {
  const { env, sql } = await setup();
  const time = Date.parse('2026-11-21T09:05Z');
  t.mock.method(Date, 'now', () => time);
  const launches: number[] = [];
  env.RUN_WORKFLOW = {
    createBatch: async ({ instances }: { instances: { id: string }[] }) => {
      launches.push(instances.length);
      return { created: instances, errors: [] };
    },
  } as unknown as typeof env.RUN_WORKFLOW;
  const insert = sql.prepare(`INSERT INTO schedules(id,org_id,prompt_id,preset,days,times_json,timezone,enabled,created_at,next_due_at)
    VALUES(?,'org','p1','daily','[0,1,2,3,4,5,6]',?,'UTC',1,0,?)`);
  for (let i=0;i<100;i++) insert.run(`a-later-${i}`, '["23:00"]', Date.parse('2026-11-21T23:00Z'));
  for (let i=0;i<1500;i++) insert.run(`z-due-${i}`, '["09:00"]', Date.parse('2026-11-21T09:00Z'));
  await sweep(env);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM runs WHERE workflow_started=1").get()?.n, 1500);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM schedules WHERE last_slot IS NULL").get()?.n, 100);
  assert.deepEqual(launches, Array(15).fill(100));
  await sweep(env);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM runs").get()?.n, 1500);
});

test('dispatch confirms only created or existing IDs and reclaims queued work with a new generation', async (t) => {
  const { env, sql } = await setup();
  const { launchRuns, recoverQueuedWorkflows } = await import('../src/server/dispatch');
  const { executeRun } = await import('../src/server/provider');
  const time = Date.parse('2026-11-21T09:05Z');
  t.mock.method(Date, 'now', () => time);
  const runs = await Promise.all([1,2,3].map(i => createRun(env, 'org', 'p1', `dispatch-test-${i}`)));
  const ids = runs.map(run => String(run.id)).sort();
  let batches = 0;
  let launched: { id: string; params: { runId: string; generation: number } }[] = [];
  env.RUN_WORKFLOW = { createBatch: async ({instances}: {instances: typeof launched}) => {
    launched = instances;
    batches++;
    return batches === 1 ? { created: [instances[0]], errors: [{index:1,code:10405},{index:2,code:500}] } : { created:instances, errors:[] };
  }} as unknown as typeof env.RUN_WORKFLOW;
  assert.equal(await launchRuns(env, ids), 2);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM runs WHERE workflow_started=0").get()?.n, 1);
  sql.prepare("UPDATE runs SET status='submitted',task_id='task',submitted_at=? WHERE id=?").run(time, ids[1]);
  await recoverQueuedWorkflows(env, time + 16 * 60_000);
  assert.equal(await launchRuns(env), 2);
  assert.deepEqual(launched.map(instance => instance.id), [ids[0]+"-1", ids[2]]);
  assert.equal(sql.prepare("SELECT workflow_generation FROM runs WHERE id=?").get(ids[1])?.workflow_generation, 0);
  await executeRun(env, ids[0], 0);
  assert.equal(sql.prepare("SELECT status FROM runs WHERE id=?").get(ids[0])?.status, 'queued');
});

test('MCP run_prompts shares REST admission and launches the submitted batch', async () => {
  const { env, sql } = await setup();
  const { hashToken } = await import('../src/server/crypto');
  const { mcp } = await import('../src/server/mcp');
  const db = env.DB;
  const key = 'trk_dispatch_fixture';
  await db.prepare("INSERT INTO user VALUES('owner','Owner','owner@example.test',1,NULL,0,0)").run();
  await db.prepare("INSERT INTO memberships VALUES('org','owner','owner',0)").run();
  await db.prepare(`INSERT INTO api_keys(id,org_id,user_id,name,prefix,token_hash,scopes,expires_at,created_at)
    VALUES('dispatch-key','org','owner','Agent','trk',?,'["run"]',?,0)`).bind(await hashToken(key),Date.now()+60_000).run();
  const insert = sql.prepare("INSERT INTO prompts(id,org_id,workspace_id,text,created_at,updated_at) VALUES(?,'org','w',?,0,0)");
  const prompt_ids = Array.from({ length: 101 }, (_, i) => `agent-prompt-${i}`);
  for (const id of prompt_ids) insert.run(id, `Question ${id}`);
  let started = 0;
  env.RUN_WORKFLOW = { createBatch: async ({instances}: {instances: {id:string}[]}) => {
    started += instances.length;
    return {created:instances,errors:[]};
  }} as unknown as typeof env.RUN_WORKFLOW;
  const pending: Promise<unknown>[] = [];
  const context = {waitUntil: (promise: Promise<unknown>) => pending.push(promise)} as unknown as import('../src/server/types').Ctx;
  const call = async () => (await mcp(new Request('https://example.test/mcp', {
    method:'POST', headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'run_prompts',arguments:{prompt_ids,batch_key:'agent-batch-test'}}}),
  }), env, context)).json() as Promise<{result:{isError:boolean;content:{text:string}[]}}>;
  sql.exec(`UPDATE api_keys SET scopes='["read"]' WHERE id='dispatch-key'`);
  const denied = await call();
  assert.equal(denied.result.isError, true);
  assert.equal(JSON.parse(denied.result.content[0].text).status, 403);
  sql.exec(`UPDATE api_keys SET scopes='["run"]' WHERE id='dispatch-key'`);
  const response = await call();
  assert.equal(response.result.isError,false);
  assert.equal(JSON.parse(response.result.content[0].text).runs.length,101);
  await Promise.all(pending);
  assert.equal(started,101);
});
