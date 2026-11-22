import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture} from './helpers/billing-fixture';import {seal} from '../src/server/crypto';import {createBulkRuns,createBulkSchedules,updateBulkSchedules} from '../src/server/bulk';
import { createRun } from '../src/server/provider';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { runUsage, runUsagePeriods } from '../src/server/run-admission';
import { admitDueSchedules, sweep } from '../src/server/scheduler';
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

  await assert.rejects(queue({ ...payload, repetitions: 3 }), { status: 429 });
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

test('a collection above 500 runs uses the monthly quota and can return counts without rows', async () => {
  const { env, sql } = await setup();
  assignRunLimit(sql, 750);
  const insert = sql.prepare("INSERT INTO prompts(id,org_id,workspace_id,text,created_at,updated_at) VALUES(?,'org','w',?,0,0)");
  const prompt_ids = Array.from({ length: 250 }, (_, i) => `collection-prompt-${i}`);
  for (const id of prompt_ids) insert.run(id, `Question ${id}`);
  const input = { prompt_ids, repetitions: 3, batch_key: 'over-old-limit', include_runs: false };
  const summary = await createBulkRuns(env, 'org', input);
  assert.equal(summary.complete, true);
  assert.equal(summary.accepted, 750);
  assert.deepEqual(summary.runs, []);
  const replay = await createBulkRuns(env, 'org', { ...input, include_runs: true });
  assert.equal(new Set(replay.runs.map(run => run.id)).size, 750);
  assert.equal((await runUsage(env, 'org', runUsagePeriods(Date.now())))?.monthly, 750);
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
test('a large schedule is created paused through REST, enabled through MCP, and admitted in pages', async (t) => {
  const { env, sql } = await setup();
  assignRunLimit(sql, 1200);
  let time = Date.parse('2026-11-21T08:00Z');
  t.mock.method(Date, 'now', () => time);
  const insert = sql.prepare("INSERT INTO prompts(id,org_id,workspace_id,text,created_at,updated_at) VALUES(?,'org','w',?,0,0)");
  const prompt_ids = Array.from({ length: 600 }, (_, i) => `schedule-prompt-${i}`);
  for (const id of prompt_ids) insert.run(id, `Question ${id}`);
  const { api } = await import('../src/server/api');
  const { mcp } = await import('../src/server/mcp');
  const { hashToken } = await import('../src/server/crypto');
  const context = { waitUntil: () => {} } as unknown as import('../src/server/types').Ctx;
  const key = 'trk_large_schedule_fixture';
  sql.prepare(`INSERT INTO api_keys(id,org_id,user_id,name,prefix,token_hash,scopes,expires_at,created_at)
    VALUES('schedule-key','org','alice','Agent','trk',?,'["read","write"]',?,0)`).run(await hashToken(key), time + 60_000);
  const tool = async (name: string, args: object) => (await mcp(new Request('https://example.test/mcp', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }), env, context)).json() as Promise<{ result: { isError: boolean; content: { text: string }[] } }>;
  const payload = { prompt_ids, batch_id: crypto.randomUUID(), preset: 'daily', days: [0], times: ['09:00', '17:00'], timezone: 'UTC', repetitions: 2 };
  const create = (input = payload) => api(new Request('https://example.test/api/v1/schedules/bulk?org=org', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }), env, context, { userId: 'alice', orgId: 'org' });

  await assert.rejects(create({ ...payload, prompt_ids: [...prompt_ids, 'foreign'] }), { status: 404 });
  assert.equal(sql.prepare('SELECT count(*) AS n FROM schedules').get()?.n, 0);
  const response = await create({ ...payload, prompt_ids: prompt_ids.slice(0, 550) });
  assert.equal(response.status, 201);
  const batch = await response.json() as { batch_id: string; schedule_ids: string[]; enabled: boolean; runs_per_time: number; runs_per_scheduled_day: number };
  assert.equal(batch.enabled, false);
  assert.equal(batch.runs_per_time, 1100);
  assert.equal(batch.runs_per_scheduled_day, 2200);
  assert.equal(new Set(batch.schedule_ids).size, 550);
  const appended = await tool('create_schedules', { ...payload, prompt_ids: prompt_ids.slice(550) });
  assert.equal(appended.result.isError, false);
  const remainder = JSON.parse(appended.result.content[0].text) as typeof batch;
  const replay = await (await create()).json() as typeof batch;
  assert.equal(remainder.batch_id, batch.batch_id);
  assert.deepEqual(new Set(replay.schedule_ids), new Set([...batch.schedule_ids, ...remainder.schedule_ids]));
  assert.equal(sql.prepare('SELECT count(*) AS n FROM schedules').get()?.n, 600);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM runs').get()?.n, 0);
  const list = async (query = '') => (await api(new Request('https://example.test/api/v1/schedules?org=org' + query),
    env, context, { userId: 'alice', orgId: 'org' })).json() as Promise<{
      schedules: { id: string }[]; next_cursor: { before: number; before_id: string } | null;
    }>;
  const firstPage = await list();
  assert.equal(firstPage.schedules.length, 500);
  const cursor = firstPage.next_cursor!;
  const listed = await tool('list_schedules', cursor);
  assert.equal(listed.result.isError, false);
  const secondPage = JSON.parse(listed.result.content[0].text) as typeof firstPage;
  assert.equal(secondPage.next_cursor, null);
  assert.deepEqual(new Set([...firstPage.schedules, ...secondPage.schedules].map(schedule => schedule.id)), new Set(replay.schedule_ids));

  const rejected = await tool('update_schedules', { ids: [...replay.schedule_ids, 'foreign'], enabled: true });
  assert.equal(rejected.result.isError, true);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM schedules WHERE enabled=1').get()?.n, 0);
  const enabled = await tool('update_schedules', { ids: replay.schedule_ids, enabled: true });
  assert.equal(enabled.result.isError, false);
  assert.equal(JSON.parse(enabled.result.content[0].text).updated, 600);
  await admitDueSchedules(env, time);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM runs').get()?.n, 0);

  time = Date.parse('2026-11-21T09:05Z');
  await admitDueSchedules(env, time);
  await admitDueSchedules(env, time);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM runs').get()?.n, 1200);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM schedules WHERE batch_id=? AND repetitions=2 AND next_due_at=?')
    .get(batch.batch_id, Date.parse('2026-11-21T17:00Z'))?.n, 600);
  time = Date.parse('2026-11-21T17:05Z');
  await admitDueSchedules(env, time);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM runs').get()?.n, 1200);
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

test('removing prompt pauses preserves schedule state and stops previously blocked monitoring', () => {
  const sql = new DatabaseSync(':memory:');
  const migration = '0026_remove_prompt_enabled.sql';
  for (const file of readdirSync('migrations').filter(file => file.endsWith('.sql') && file < migration).sort()) {
    sql.exec(readFileSync('migrations/' + file, 'utf8'));
  }
  sql.exec(`INSERT INTO organizations(id,name,created_at) VALUES('org','Organization',0);
    INSERT INTO workspaces(id,org_id,name,created_at) VALUES('workspace','org','Workspace',0);
    INSERT INTO prompts(id,org_id,workspace_id,text,enabled,created_at,updated_at)
      VALUES('paused','org','workspace','Paused question',0,0,0),('ready','org','workspace','Ready question',1,0,0);
    INSERT INTO schedules(id,org_id,prompt_id,preset,days,times_json,timezone,enabled,created_at,next_due_at,retry_at,last_slot)
      VALUES('blocked','org','paused','daily','[1]','["09:00"]','UTC',1,0,100,110,'2026-11-20@09:00'),
        ('active','org','ready','daily','[1]','["09:00"]','UTC',1,0,100,110,NULL);`);
  sql.exec(readFileSync('migrations/' + migration, 'utf8'));
  const schedules = sql.prepare('SELECT id,enabled,next_due_at,retry_at,last_slot FROM schedules ORDER BY id').all();
  assert.deepEqual(schedules.map(Object.values), [
    ['active',1,100,110,null], ['blocked',0,null,0,'2026-11-20@09:00'],
  ]);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM prompts WHERE archived_at IS NULL").get()?.n, 2);
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), []);
  sql.close();
});

test('manual runs are available while a schedule is paused', async () => {
  const { env, sql } = await setup();
  const schedule = await createBulkSchedules(env, 'org', {
    prompt_ids: ['p1'], preset: 'daily', days: [1], times: ['09:00'], timezone: 'UTC',
  });
  await createRun(env, 'org', 'p1', 'manual-while-paused');
  await createBulkRuns(env, 'org', { prompt_ids: ['p1'], batch_key: 'bulk-while-paused' });
  await admitDueSchedules(env, Date.now());
  assert.equal(sql.prepare('SELECT count(*) AS n FROM runs WHERE prompt_id=?').get('p1')?.n, 2);
  assert.equal(sql.prepare('SELECT enabled FROM schedules WHERE id=?').get(schedule.schedule_ids[0])?.enabled, 0);
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
 await assert.rejects(call({ids:['p1','p2'],mode:'standard',enabled:false}),{status:400});
 await assert.rejects(call({ids:['p1','foreign'],mode:'standard'}),/not in this organization/);
 assert.ok(sql.prepare('SELECT * FROM prompts').all().every(p=>p.mode==='priority'));
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

test("changing only first time preserves mixed schedule settings and remaining time slots", async () => {
  const { env, sql } = await setup();
  const daily = await createBulkSchedules(env, "org", { prompt_ids: ["p1"], preset: "daily", days: [0],
    times: ["09:00", "17:00"], timezone: "America/Los_Angeles", repetitions: 3, enabled: true });
  const weekly = await createBulkSchedules(env, "org", { prompt_ids: ["p2"], preset: "weekly", days: [5],
    times: ["06:00"], timezone: "UTC", repetitions: 2 });
  const ids = [...daily.schedule_ids, ...weekly.schedule_ids];
  const rows = () => sql.prepare("SELECT preset,days,timezone,times_json,repetitions,enabled,last_slot FROM schedules ORDER BY prompt_id").all();
  const previous = rows();
  await updateBulkSchedules(env, "org", { ids, first_time: "10:30" });
  assert.deepEqual(rows().map(row => ({ ...row })), [
    { ...previous[0], times_json: '["10:30","17:00"]' },
    { ...previous[1], times_json: '["10:30"]' },
  ]);
});
