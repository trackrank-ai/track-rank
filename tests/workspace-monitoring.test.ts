import assert from "node:assert/strict";
import { test } from "node:test";
import { firstBrandMatch, recordedListNumber } from "../src/lib/brand-passage";
import { api } from "../src/server/api";
import { mcp } from "../src/server/mcp";
import { hashToken } from "../src/server/crypto";
import { fixture } from "./helpers/billing-fixture";

test("earliest recorded brand alias uses whole words, exact answer offsets and literal punctuation", () => {
  const answer = "🚗 Not Atlasware. Try A+t or ATLAS Co.";
  const match = firstBrandMatch(answer, ["Atlas", "Atlas Co.", "a+t"]);
  assert.ok(match);
  assert.equal(answer.slice(match.start, match.end), "A+t");
  assert.equal(firstBrandMatch("atlas co.", ["Atlas", "Atlas Co."])?.text, "atlas co.");
  assert.equal(firstBrandMatch("éAtlasware", ["Atlas"]), null);
  const list = "Available products\n2. **Atlas**";
  assert.equal(recordedListNumber(list, list.indexOf("Atlas")),2);
  assert.equal(recordedListNumber("1. Avoid Atlas",9),null);
  assert.equal(recordedListNumber("Models like 1. Atlas",15),null);
});

test("workspace setup and verified passages match REST and read-only MCP in tenant scope", async () => {
  const { sql, env } = fixture();
  const time = Date.now();
  sql.exec(`INSERT INTO organizations(id,name,created_at) VALUES('other','Other',0);
    INSERT INTO workspaces(id,org_id,name,created_at) VALUES('w','org','Client',0),('x','other','Foreign',0);
    INSERT INTO brands(id,org_id,name,kind,created_at) VALUES('b','org','Atlas','own',0);
    INSERT INTO workspace_brands(org_id,workspace_id,brand_id,kind) VALUES('org','w','b','client');
    INSERT INTO prompts(id,org_id,workspace_id,text,created_at,updated_at) VALUES('p','org','w','A question',0,0);
    INSERT INTO user VALUES('v','Viewer','v@example.test',1,NULL,0,0);
    INSERT INTO memberships VALUES('org','v','viewer',0);`);
  const config = JSON.stringify({engine:"chatgpt", brands:[{id:"b",name:"Atlas",aliases:'["AT Co"]'}]});
  sql.prepare(`INSERT INTO runs(id,org_id,prompt_id,workspace_id,prompt_text,config,status,answer_text,mentions,has_answer,idempotency_key,created_at,updated_at)
    VALUES('r','org','p','w','A question',?,'succeeded','Try AT Co today.',?,1,'r',?,?)`)
    .run(config, JSON.stringify([{brand_id:"b",mentioned:true,cited:false}]),time,time);
  const key = "trk_monitoring_read_fixture";
  sql.prepare(`INSERT INTO api_keys(id,org_id,user_id,name,prefix,token_hash,scopes,expires_at,created_at)
    VALUES('read','org','v','Report','trk',?,'["read"]',?,0)`).run(await hashToken(key),time+3600000);
  const ctx = {waitUntil() {}} as any;
  const get = (path:string) => api(new Request("https://example.test/api/v1"+path),env,ctx,{userId:"v",orgId:"org"});
  const tool = async (name:string,args:object) => {
    const response = await mcp(new Request("https://example.test/mcp",{method:"POST",
      headers:{Authorization:"Bearer "+key,"Content-Type":"application/json",Accept:"application/json, text/event-stream"},
      body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:args}})}),env,ctx);
    return (await response.json() as any).result;
  };
  const setup = await (await get("/workspaces/w/monitoring")).json() as any;
  assert.equal(setup.questions,1);
  assert.equal(setup.engines[0].answers,1);
  assert.equal(setup.engines[0].schedules,0);
  assert.equal(setup.brands[0].kind,"client");
  assert.deepEqual(JSON.parse((await tool("get_workspace_monitoring",{workspace_id:"w"})).content[0].text),setup);
  sql.exec(`INSERT INTO prompts(id,org_id,workspace_id,text,engine,created_at,updated_at) VALUES('p2','org','w','A question','gemini',0,0);
    INSERT INTO schedules(id,org_id,prompt_id,preset,days,times_json,timezone,enabled,created_at,next_due_at)
    VALUES('s','org','p','daily','[]','["08:00"]','UTC',1,0,2000),('s2','org','p2','daily','[]','["09:00"]','UTC',0,0,1000);
    INSERT INTO workspaces(id,org_id,name,created_at,archived_at) VALUES('del','org','Archived',0,1);`);
  for (let i=0; i<25; i++) sql.prepare("INSERT INTO workspaces(id,org_id,name,created_at) VALUES(?,'org',?,0)").run("empty"+i,"Empty "+i);
  const summary = await (await get("/workspaces/monitoring")).json() as any;
  assert.equal(summary.dataforseo_configured,false);
  assert.equal(summary.next_page,2);
  assert.equal(summary.workspaces.length,25);
  assert.deepEqual(summary.workspaces[0],{id:"w",name:"Client",questions:1,tracked_brands:1,enabled_schedules:1,next_check_at:2000});
  assert.deepEqual(JSON.parse((await tool("list_workspace_monitoring",{})).content[0].text),summary);
  const tail = JSON.parse((await tool("list_workspace_monitoring",{page:2})).content[0].text);
  assert.equal(tail.next_page,null);
  assert.equal(tail.workspaces.length,1);
  assert.equal(tail.workspaces[0].next_check_at,null);
  assert.ok([...summary.workspaces,...tail.workspaces].every(row => row.id !== "x" && row.id !== "del"));
  await assert.rejects(get("/workspaces/monitoring?page=0"),{status:400});
  assert.equal((await tool("list_workspace_monitoring",{page:0})).isError,true);
  const { run } = await (await get("/runs/r")).json() as any;
  assert.deepEqual(run.mentions[0].first_match,{start:4,end:9,text:"AT Co"});
  assert.deepEqual(JSON.parse((await tool("get_run",{run_id:"r"})).content[0].text).run.mentions,run.mentions);
  await assert.rejects(get("/workspaces/x/monitoring"),{status:404});
  assert.equal((await tool("get_workspace_monitoring",{workspace_id:"x"})).isError,true);
});

test("bulk classification is shared by engine variants and scoped to accessible active questions", async () => {
  const { sql, env } = fixture();
  sql.exec(`INSERT INTO organizations(id,name,created_at) VALUES('other','Other',0);
    INSERT INTO workspaces(id,org_id,name,created_at) VALUES('w','org','Client',0),('x','other','Foreign',0);
    INSERT INTO prompts(id,org_id,workspace_id,text,engine,created_at,updated_at) VALUES
    ('a','org','w','First question','chatgpt',0,0),('b','org','w','First question','gemini',0,0),
    ('c','org','w','Second question','chatgpt',0,0),('d','other','x','Foreign question','chatgpt',0,0);`);
  const key = "trk_classify_write_fixture";
  sql.prepare(`INSERT INTO api_keys(id,org_id,user_id,name,prefix,token_hash,scopes,expires_at,created_at)
    VALUES('write','org','alice','Editor','trk',?,'["read","write"]',?,0)`).run(await hashToken(key),Date.now()+3600000);
  const ctx = {waitUntil() {}} as any;
  const change = (ids:string[],question_type:string|null) => api(new Request("https://example.test/api/v1/prompts/question-type", {
    method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids,question_type})
  }),env,ctx,{userId:"alice",orgId:"org"});
  await assert.rejects(change(["a","d"],"comparison"),{status:404});
  assert.equal(sql.prepare("SELECT count(*) AS n FROM prompt_questions WHERE question_type IS NOT NULL").get()?.n,0);
  const response = await mcp(new Request("https://example.test/mcp",{method:"POST",
    headers:{Authorization:"Bearer "+key,"Content-Type":"application/json",Accept:"application/json, text/event-stream"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"classify_questions",arguments:{ids:["a"],question_type:"branded"}}})}),env,ctx);
  const result = (await response.json() as any).result;
  assert.equal(result.isError,false,result.content[0].text);
  const list = await api(new Request("https://example.test/api/v1/prompts?view=library&question_type=branded"),env,ctx,{userId:"alice",orgId:"org"});
  const {prompts} = await list.json() as any;
  assert.equal(prompts.length,1);
  assert.equal(prompts[0].question_type,"branded");
  assert.equal(prompts[0].variants.length,2);
  assert.deepEqual(await (await change(["a","b"],null)).json(),{updated:1});
});
