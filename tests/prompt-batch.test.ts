import {test} from 'node:test';import assert from 'node:assert/strict';import {inspectPromptInput,parsePromptInput} from '../src/lib/prompt-input';import {savePromptBatch} from '../src/server/prompt-batch';import {fixture} from './helpers/billing-fixture';
const base={workspace_id:'space',texts:['Best cleaners?','Affordable cleaners?'],engines:['chatgpt','gemini','google']};
function setup(){const f=fixture();f.sql.exec("INSERT INTO workspaces(id,org_id,name,created_at) VALUES('space','org','Space',0)");return f;}
test('paste supports lines or quoted commas; lines preserve natural punctuation and duplicate prompts collapse',()=>{
 assert.deepEqual(parsePromptInput('Best cleaners?\nCleaners, near Seattle?\r\nBest cleaners?'),['Best cleaners?','Cleaners, near Seattle?']);assert.deepEqual(parsePromptInput('Best cleaners?, "Cleaners, near Seattle?"'),['Best cleaners?','Cleaners, near Seattle?']);assert.deepEqual(parsePromptInput('Cleaners, near Seattle?','lines'),['Cleaners, near Seattle?']);assert.throws(()=>parsePromptInput('"Missing close, quote'),/Close the quoted/);
});
test('batch atomically saves engine variants, reuses exact matches, and rejects cross-tenant edits',async()=>{
 const {env,sql}=setup();const first=await savePromptBatch(env,'org',base);assert.equal(first.saved_combinations,6);assert.equal(sql.prepare('SELECT count(*) AS n FROM prompts').get()?.n,6);await savePromptBatch(env,'org',base);assert.equal(sql.prepare('SELECT count(*) AS n FROM prompts').get()?.n,6);await assert.rejects(savePromptBatch(env,'another',base),/Workspace not found/);
 const source=sql.prepare("SELECT id FROM prompts WHERE engine='gemini' LIMIT 1").get()!;await savePromptBatch(env,'org',{...base,texts:['Updated question?'],engines:['gemini','google'],source_id:source.id});assert.equal(sql.prepare('SELECT engine,text FROM prompts WHERE id=?').get(source.id)?.engine,'gemini');assert.equal(sql.prepare("SELECT count(*) AS n FROM prompts WHERE text='Updated question?'").get()?.n,2);
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
  const payload = JSON.stringify({...base,texts,engines:['chatgpt']});
  assert.ok(Buffer.byteLength(payload) > 32_768);
  const response = await api(new Request('https://example.test/api/v1/prompts/bulk?org=org',{
    method:'POST',body:payload,headers:{'Content-Type':'application/json'},
  }),env,{waitUntil:()=>{}} as any,{userId:'owner',orgId:'org'});
  assert.equal(response.status,201);
  assert.equal((await response.json() as {saved_combinations:number}).saved_combinations,500);
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
  )).json() as Promise<{prompts:{id:string; actively_scheduled:number}[];next_cursor:{before:number;before_id:string}|null}>;
  const insert = sql.prepare("INSERT INTO prompts(id,org_id,workspace_id,brand_id,text,engine,enabled,created_at,updated_at) VALUES(?,'org','space',?,?,?,?,10,10)");
  for (let i = 0; i < 105; i++) insert.run("p"+String(i).padStart(3,"0"),null,"Test keyword "+i,"google",1);
  insert.run("explicit-other","other","Test keyword other","google",1);
  insert.run("disabled",null,"Test keyword disabled","google",0);
  insert.run("wrong-engine",null,"Test keyword another engine","gemini",1);
  sql.exec(`INSERT INTO schedules(id,org_id,prompt_id,preset,days,local_time,timezone,enabled,created_at)
    VALUES('on','org','p000','daily','[1]','09:00','UTC',1,0),
      ('off','org','p001','daily','[1]','09:00','UTC',0,0),
      ('disabled-prompt','org','disabled','daily','[1]','09:00','UTC',1,0)`);
  const query = "q=KEYWORD&engine=google&brand=client";
  const page = await list(query);
  assert.equal(page.prompts.length,100);
  const next = await list(query + "&before=" + page.next_cursor?.before + "&before_id=" + page.next_cursor?.before_id);
  assert.equal(next.prompts.length,6);
  assert.equal(new Set([...page.prompts,...next.prompts].map(prompt => prompt.id)).size,106);
  assert.equal(next.next_cursor,null);
  assert.deepEqual((await list(query + "&schedule=active")).prompts.map(row => [row.id,row.actively_scheduled]), [["p000",1]]);
  assert.deepEqual((await list(query + "&schedule=inactive")).prompts.map(row => row.actively_scheduled),Array(100).fill(0));
});
