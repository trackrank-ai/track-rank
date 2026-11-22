import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import {test} from 'node:test';import assert from 'node:assert/strict';import {inspectPromptInput,parsePromptInput} from '../src/lib/prompt-input';import {savePromptBatch} from '../src/server/prompt-batch';import {fixture} from './helpers/billing-fixture';
test("a single line preserves commas and counts repeated nonblank questions", () => {
  const question = "For a small agency, which reporting tools work best?";
  assert.deepEqual(inspectPromptInput(`  ${question} \r\n\n${question}`), {
    prompts: [question], repeated: 1, error: "",
  });
});
const base={workspace_id:'space',texts:['Best cleaners?','Affordable cleaners?'],engines:['chatgpt','gemini','google']};
function setup(){const f=fixture();f.sql.exec("INSERT INTO workspaces(id,org_id,name,created_at) VALUES('space','org','Space',0)");return f;}
test('paste supports lines or quoted commas; lines preserve natural punctuation and duplicate prompts collapse',()=>{
 assert.deepEqual(parsePromptInput('Best cleaners?\nCleaners, near Seattle?\r\nBest cleaners?'),['Best cleaners?','Cleaners, near Seattle?']);assert.deepEqual(parsePromptInput('Best cleaners?, "Cleaners, near Seattle?"', "commas"),['Best cleaners?','Cleaners, near Seattle?']);assert.deepEqual(parsePromptInput('Cleaners, near Seattle?','lines'),['Cleaners, near Seattle?']);assert.throws(()=>parsePromptInput('"Missing close, quote', "commas"),/Close the quoted/);
});
test('batch atomically saves engine variants, reuses exact matches, and rejects cross-tenant saves and legacy edit payloads',async()=>{
 const {env,sql}=setup();const first=await savePromptBatch(env,'org',base);assert.equal(first.saved_combinations,6);assert.equal(sql.prepare('SELECT count(*) AS n FROM prompts').get()?.n,6);await savePromptBatch(env,'org',base);assert.equal(sql.prepare('SELECT count(*) AS n FROM prompts').get()?.n,6);await assert.rejects(savePromptBatch(env,'another',base),/Workspace not found/);
 const source=sql.prepare("SELECT id,text FROM prompts WHERE engine='gemini' LIMIT 1").get()!;
 await assert.rejects(savePromptBatch(env,'org',{...base,texts:['Updated question?'],engines:['gemini','google'],source_id:source.id}), /source_id/);
 assert.equal(sql.prepare('SELECT text FROM prompts WHERE id=?').get(source.id)?.text,source.text);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM prompts').get()?.n,6);
});
test('bad inputs and more than 500 prompt-engine combinations do not partially save',async()=>{
 const {env,sql}=setup();await assert.rejects(savePromptBatch(env,'org',{...base,texts:['valid question','x']}));assert.equal(sql.prepare('SELECT count(*) AS n FROM prompts').get()?.n,0);await assert.rejects(savePromptBatch(env,'org',{...base,texts:Array.from({length:167},(_,i)=>'Question '+i)}),/Detected 501.*500/);assert.equal(sql.prepare('SELECT count(*) AS n FROM prompts').get()?.n,0);
});

test("the preview counts oversized pastes and a maximum-sized save passes the actual API body limit", async () => {
  const {env,sql}=setup();
  sql.exec("INSERT INTO user VALUES('owner','Owner','owner@example.test',1,NULL,0,0); INSERT INTO memberships VALUES('org','owner','owner',0)");
  const texts = Array.from({length:500}, (_, i) => ("Question " + i + " " + "é".repeat(700)).slice(0,700));
  assert.equal(inspectPromptInput([...texts, "One more prompt"].join("\n")).prompts.length,501);
  const { api } = await import('../src/server/api');
  const payload = JSON.stringify({...base,texts,engines:['chatgpt'],operation_id:crypto.randomUUID()});
  assert.ok(Buffer.byteLength(payload) > 32_768);
  const response = await api(new Request('https://example.test/api/v1/prompts/bulk?org=org',{
    method:'POST',body:payload,headers:{'Content-Type':'application/json'},
  }),env,{waitUntil:()=>{}} as any,{userId:'owner',orgId:'org'});
  assert.equal(response.status,201);
  const receipt = await response.json() as {saved_combinations:number; prompts:{id:string;text:string}[]};
  assert.equal(receipt.saved_combinations,500);
  assert.deepEqual(receipt.prompts.map(row => row.text),texts);
  assert.equal(new Set(receipt.prompts.map(row => row.id)).size,500);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM prompts').get()?.n,500);
});

test("saved prompt filters combine keyword, engine, schedule, and client across pages", async () => {
  const {env,sql}=setup();
  sql.exec(`INSERT INTO user VALUES('owner','Owner','owner@example.test',1,NULL,0,0);
    INSERT INTO memberships VALUES('org','owner','owner',0);
    INSERT INTO brands(id,org_id,name,kind,created_at) VALUES('client','org','Client','client',0),('other','org','Other','client',0);
    UPDATE workspaces SET brand_id='client' WHERE id='space';`);
  const { api } = await import('../src/server/api');
  const list = async (query: string) => (await api(
    new Request('https://example.test/api/v1/prompts?org=org&workspace=space&view=library&' + query),
    env,{waitUntil:()=>{}} as any,{userId:'owner',orgId:'org'},
  )).json() as Promise<{prompts:{id:string; variants:{id:string; actively_scheduled:number}[]}[];next_cursor:{before:number;before_id:string}|null}>;
  const insert = sql.prepare("INSERT INTO prompts(id,org_id,workspace_id,brand_id,text,engine,created_at,updated_at) VALUES(?,'org','space',?,?,?,10,10)");
  for (let i = 0; i < 105; i++) insert.run("p"+String(i).padStart(3,"0"),null,"Test keyword "+i,"google");
  insert.run("explicit-other","other","Test keyword other","google");
  insert.run("paused",null,"Test keyword paused","google");
  insert.run("wrong-engine",null,"Test keyword another engine","gemini");
  sql.exec(`INSERT INTO schedules(id,org_id,prompt_id,preset,days,times_json,timezone,enabled,created_at,batch_id)
    VALUES('on','org','p000','daily','[1]','["09:00"]','UTC',1,0,'on-batch'),
      ('off','org','p001','daily','[1]','["09:00"]','UTC',0,0,'off-batch'),
      ('paused-prompt','org','paused','daily','[1]','["09:00"]','UTC',0,0,'paused-batch')`);
  const query = "q=KEYWORD&engine=google&brand=client";
  const page = await list(query);
  assert.equal(page.prompts.length,100);
  const next = await list(query + "&before=" + page.next_cursor?.before + "&before_id=" + page.next_cursor?.before_id);
  assert.equal(next.prompts.length,6);
  assert.equal(new Set([...page.prompts,...next.prompts].map(prompt => prompt.id)).size,106);
  assert.equal(next.next_cursor,null);
  assert.deepEqual((await list(query + "&schedule=active")).prompts.map(row => [row.variants[0].id,row.variants[0].actively_scheduled]), [["p000",1]]);
  assert.deepEqual((await list(query + "&schedule=inactive")).prompts.map(row => row.variants[0].actively_scheduled),Array(100).fill(0));
});

test("preview and operation receipt identify exact combinations and separate paused monitoring", async () => {
  const { env, sql } = setup();
  const { previewPromptBatch, getPromptReceipt } = await import("../src/server/prompt-batch");
  const question = "For a small agency, which reporting tools work best?";
  const input = { workspace_id: "space", texts: [question, question], engines: ["chatgpt", "gemini"] };
  const first = await savePromptBatch(env, "org", { ...input, engines: ["chatgpt"], tags: ["preserve"] });
  const existing = first.prompts[0].id;
  sql.prepare(`INSERT INTO schedules(id,org_id,prompt_id,preset,days,times_json,timezone,enabled,created_at)
    VALUES('schedule','org',?,'weekly','[1]','["09:00"]','UTC',0,0)`).run(existing);
  const preview = await previewPromptBatch(env, "org", input);
  assert.deepEqual(preview.prompts.map(row => [row.engine, row.outcome, row.monitoring]),
    [["chatgpt", "reused", "paused"], ["gemini", "new", "none"]]);
  const operation_id = crypto.randomUUID();
  const saved = await savePromptBatch(env, "org", { ...input, operation_id });
  assert.deepEqual(saved.prompts.map(row => row.outcome), ["reused", "created"]);
  assert.equal(saved.questions, 1);
  assert.equal(saved.prompts[0].id, existing);
  await savePromptBatch(env, "org", { ...input, texts: ["A different question"] });
  assert.deepEqual(await getPromptReceipt(env, "org", operation_id), saved);
  assert.deepEqual(await savePromptBatch(env, "org", { ...input, operation_id }), saved);
  await assert.rejects(savePromptBatch(env, "org", { ...input, operation_id, mode: "priority" }), { status: 409 });
  await assert.rejects(getPromptReceipt(env, "other", operation_id), { status: 404 });
  assert.equal(sql.prepare("SELECT tags FROM prompts WHERE id=?").get(existing)?.tags, '["preserve"]');
});

test("REST and MCP share receipt actions, exact batch status and readiness", async () => {
  const { env, sql } = setup();
  const { api } = await import("../src/server/api");
  const { mcp } = await import("../src/server/mcp");
  const { seal, hashToken } = await import("../src/server/crypto");
  const ctx = { waitUntil: () => {} } as unknown as import("../src/server/types").Ctx;
  const call = async (path: string, input?: object) => {
    const response = await api(new Request("https://example.test/api/v1" + path + "?org=org", {
      method: input ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: input ? JSON.stringify(input) : undefined,
    }), env, ctx, { userId: "alice", orgId: "org" });
    return response.json() as Promise<any>;
  };
  const token = "trk_monitoring_fixture";
  sql.prepare(`INSERT INTO api_keys(id,org_id,user_id,name,prefix,token_hash,scopes,expires_at,created_at)
    VALUES('agent','org','alice','Agent','trk',?,'["read","write","run"]',?,0)`).run(await hashToken(token), Date.now() + 60_000);
  async function tool(name: string, args: object) {
    const response = await mcp(new Request("https://example.test/mcp", {
      method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }), env, ctx);
    const { result } = await response.json() as any;
    assert.equal(result.isError, false, result.content[0].text);
    return JSON.parse(result.content[0].text);
  }
  const payload = { ...base, texts: ["A question, with a comma?"], engines: ["chatgpt", "google"] };
  const preview = await tool("preview_prompts", payload);
  assert.equal(preview.prompts.filter((row: any) => row.outcome === "new").length, 2);
  const operation_id = crypto.randomUUID();
  const receipt = await call("/prompts/bulk", { ...payload, operation_id });
  const prompt_ids = receipt.prompts.map((row: any) => row.id);
  const readiness = await tool("review_collection", { prompt_ids });
  assert.equal(readiness.provider_connected, false);
  assert.deepEqual(readiness.brands, []);
  assert.equal(readiness.requested, 2);
  const schedule = { preset: "weekly", days: [1], times: ["09:00"], timezone: "America/Los_Angeles", enabled: true };
  const action = { prompt_ids, run_samples: 1, schedule };
  const blocked = await tool("start_prompt_receipt", { operation_id, action });
  assert.match(blocked.error, /DataForSEO/);
  assert.equal(blocked.schedule, null);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM runs").get()?.n, 0);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM schedules").get()?.n, 0);
  const named = {
    ...payload, texts: [...payload.texts, "A question about tracking sets?"],
    tracking_set_name: "Example tracking set", operation_id: crypto.randomUUID(),
  };
  const namedPreview = await tool("preview_prompts", named);
  assert.deepEqual(namedPreview.prompts.map((row: any) => row.outcome), ["reused", "reused", "new", "new"]);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM prompt_sets").get()?.n, 0);
  const namedReceipt = await call("/prompts/bulk-submit", { prompts: named });
  const namedReplay = await tool("submit_prompt_batch", { prompts: named });
  assert.deepEqual(namedReplay, namedReceipt);
  assert.equal(namedReceipt.tracking_set.name, named.tracking_set_name);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM prompt_set_members WHERE set_id=?").get(namedReceipt.tracking_set.id)?.n, 4);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM runs").get()?.n, 0);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM schedules").get()?.n, 0);
  const existingOnly = await tool("submit_prompt_batch", {
    prompts: { ...named, operation_id: crypto.randomUUID(), tracking_set_name: "Existing combinations" },
  });
  assert.ok(existingOnly.prompts.every((row: any) => row.outcome === "reused"));
  assert.equal(sql.prepare("SELECT count(*) AS n FROM prompt_set_members WHERE set_id=?").get(existingOnly.tracking_set.id)?.n, 4);
  await assert.rejects(call("/prompts/bulk-submit", {
    prompts: named,
    action: { approved: [{ question: 1, engine: "chatgpt" }], schedule },
  }), { status: 409 });
  assert.equal(sql.prepare("SELECT count(*) AS n FROM prompt_sets").get()?.n, 2);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM schedules").get()?.n, 0);
  const append = {
    ...named, tracking_set_name: undefined, tracking_set_id: namedReceipt.tracking_set.id,
    texts: ["An additional question?"], engines: ["chatgpt"], operation_id: crypto.randomUUID(),
  };
  const appended = await tool("submit_prompt_batch", { prompts: append });
  assert.deepEqual(await call("/prompts/bulk-submit", { prompts: append }), appended);
  assert.deepEqual(appended.tracking_set, namedReceipt.tracking_set);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM prompt_set_members WHERE set_id=?").get(namedReceipt.tracking_set.id)?.n, 5);
  sql.exec("INSERT INTO workspaces(id,org_id,name,created_at) VALUES('elsewhere','org','Elsewhere',0)");
  await assert.rejects(call("/prompts/bulk-submit", {
    prompts: { ...append, workspace_id: "elsewhere", operation_id: crypto.randomUUID() },
  }), { status: 404 });
  assert.equal(sql.prepare("SELECT count(*) AS n FROM prompt_questions WHERE workspace_id='elsewhere'").get()?.n, 0);
  env.CREDENTIALS_KEY = Buffer.alloc(32, 4).toString("base64");
  env.RUN_WORKFLOW = { createBatch: async ({instances}: any) => ({created: instances, errors: []}) } as any;
  sql.prepare("INSERT INTO credentials VALUES(?,?,1,0)").run("org", await seal(env, "org", { login: "test", password: "fixture" }));
  const started = await call("/prompts/receipts/" + operation_id, action);
  const replay = await tool("start_prompt_receipt", { operation_id, action });
  assert.deepEqual(replay, started);
  assert.equal(replay.run.accepted, 2);
  assert.equal(replay.schedule.schedules.length, 2);
  assert.ok(replay.schedule.schedules.every((row: any) => row.next_due_at > Date.now()));
  const batch = await tool("get_run_batch", { batch_key: operation_id });
  assert.deepEqual(new Set(batch.runs.map((row: any) => row.prompt_id)), new Set(prompt_ids));
  sql.prepare("UPDATE runs SET status='uncertain',error='Provider acknowledgment missing' WHERE id=?").run(batch.runs[0].id);
  sql.prepare("UPDATE runs SET status='succeeded',has_answer=0,organic_results='[{}]' WHERE id=?").run(batch.runs[1].id);
  const loaded = await call("/runs/batches/" + operation_id);
  assert.deepEqual(loaded.runs.map((run: any) => run.status), ["uncertain", "succeeded"]);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM schedules").get()?.n, 2);

  const recurring = {
    prompts: { ...named, texts: ["Scheduled tracking set question?"], engines: ["google"], operation_id: crypto.randomUUID() },
    action: { approved: [{ question: 0, engine: "google" }], schedule },
  };
  const futureOnly = await tool("submit_prompt_batch", recurring);
  const futureReplay = await call("/prompts/bulk-submit", recurring);
  assert.deepEqual(futureReplay, futureOnly);
  assert.equal(futureOnly.result.run, null);
  assert.equal(futureOnly.result.schedule.schedules.length, 1);
  assert.ok(futureOnly.result.schedule.schedules[0].next_due_at > Date.now());
  assert.equal(sql.prepare("SELECT count(*) AS n FROM runs").get()?.n, 2);


  const optedIn = {
    prompts: { ...append, operation_id: crypto.randomUUID() },
    action: { approved: [{ question: 0, engine: "chatgpt", existing_id: appended.prompts[0].id }], run_samples: 1 },
  };
  const opted = await tool("submit_prompt_batch", optedIn);
  assert.deepEqual(await call("/prompts/bulk-submit", optedIn), opted);
  assert.equal(opted.result.run.accepted, 1);
  const stored = await tool("get_prompt_receipt", { operation_id: opted.id });
  assert.deepEqual(await tool("start_prompt_receipt", { operation_id: opted.id, action: stored.action.selection }), opted.result);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM runs").get()?.n, 3);

  const optInRecurring = {
    ...optedIn, prompts: { ...append, operation_id: crypto.randomUUID() },
    action: { approved: optedIn.action.approved, schedule },
  };
  const scheduledExisting = await tool("submit_prompt_batch", optInRecurring);
  assert.equal(scheduledExisting.result.schedule.schedules.length, 1);
  const unchanged = await tool("submit_prompt_batch", {
    ...optInRecurring, prompts: { ...append, operation_id: crypto.randomUUID() },
  });
  assert.equal(unchanged.result, null);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM schedules WHERE prompt_id=?").get(appended.prompts[0].id)?.n, 1);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM runs").get()?.n, 3);

});

test("shared question migration preserves engine and historical references", () => {
  const sql = new DatabaseSync(":memory:");
  const migration = "0027_shared_prompt_questions.sql";
  for (const file of readdirSync("migrations").filter(file => file.endsWith(".sql") && file < migration).sort()) {
    sql.exec(readFileSync("migrations/" + file, "utf8"));
  }
  sql.exec(`INSERT INTO organizations(id,name,created_at) VALUES('org','Organization',0);
    INSERT INTO workspaces(id,org_id,name,created_at) VALUES('w','org','Workspace',0);
    INSERT INTO prompts(id,org_id,workspace_id,text,engine,created_at,updated_at) VALUES
      ('g','org','w','Shared question','gemini',0,0),('c','org','w','Shared question','chatgpt',0,0);
    INSERT INTO schedules(id,org_id,prompt_id,preset,days,times_json,timezone,created_at)
      VALUES('sched','org','g','daily','[0]','["09:00"]','UTC',0);
    INSERT INTO runs(id,org_id,prompt_id,workspace_id,prompt_text,config,status,idempotency_key,created_at,updated_at)
      VALUES('run','org','c','w','Shared question','{}','succeeded','op',0,0);
    INSERT INTO prompt_sets VALUES('set','org','w','Example');
    INSERT INTO prompt_set_members VALUES('org','w','set','c');`);
  sql.exec(readFileSync("migrations/" + migration, "utf8"));
  assert.equal(sql.prepare("SELECT count(*) AS n FROM prompt_questions").get()?.n, 1);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM prompt_engines").get()?.n, 2);
  assert.equal(sql.prepare("SELECT text FROM prompts WHERE id='c'").get()?.text, "Shared question");
  assert.equal(sql.prepare("SELECT prompt_id FROM schedules WHERE id='sched'").get()?.prompt_id, "g");
  assert.equal(sql.prepare("SELECT prompt_text FROM runs WHERE id='run'").get()?.prompt_text, "Shared question");
  assert.equal(sql.prepare("SELECT prompt_id FROM prompt_set_members WHERE set_id='set'").get()?.prompt_id, "c");
  assert.deepEqual(sql.prepare("PRAGMA foreign_key_check").all(), []);
  sql.close();
});
