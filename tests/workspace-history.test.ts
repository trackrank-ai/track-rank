import assert from "node:assert/strict";
import { test } from "node:test";
import { api } from "../src/server/api";
import { seal } from "../src/server/crypto";
import { createRun } from "../src/server/provider";
import { createBulkRuns } from "../src/server/bulk";
import { fixture } from "./helpers/billing-fixture";

function setup() {
  const { sql, env } = fixture();
  sql.exec(`INSERT INTO user VALUES('owner','Owner','owner@example.test',1,NULL,0,0),('viewer','Viewer','viewer@example.test',1,NULL,0,0);
    INSERT INTO memberships VALUES('org','owner','owner',0),('org','viewer','viewer',0);
    INSERT INTO organizations(id,name,created_at) VALUES('other','Other',0);
    INSERT INTO workspaces(id,org_id,name,created_at) VALUES('source','org','Source',0),('target','org','Target',0),('foreign','other','Foreign',0);
    INSERT INTO prompts(id,org_id,workspace_id,text,created_at,updated_at) VALUES
      ('prompt','org','source','First question',0,0),('alt','org','source','Other question',0,0),('foreign-prompt','other','foreign','Foreign question',0,0);`);
  const call = (path: string, body?: unknown, userId = "owner", method = body ? "POST" : "GET") => api(
    new Request("https://example.test/api/v1" + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }), env, { waitUntil() {} } as any, { userId, orgId: "org" },
  );
  return { sql, env, call };
}

test("history combines filters before pagination and exports the matching workspace", async () => {
  const { sql, call } = setup();
  const stmt = sql.prepare(`INSERT INTO runs(id,org_id,prompt_id,workspace_id,prompt_text,config,status,answer_text,mentions,has_answer,idempotency_key,created_at,updated_at)
    VALUES(?,'org',?,?,?,?,?,?,?,?,?,10,10)`);
  const insert = (id: string, options: { workspace?: string; engine?: string; prompt?: string; status?: string; brand?: string; hasAnswer?: number; cited?: boolean } = {}) =>
    stmt.run(id, options.prompt || "prompt", options.workspace || "source", "First question", JSON.stringify({ engine: options.engine || "google" }),
      options.status || "succeeded", "An answer with a keyword",
      JSON.stringify([{ brand_id: options.brand || "client", mentioned: !options.cited, cited: !!options.cited }]), options.hasAnswer ?? 1, id);
  for (let i = 0; i < 103; i++) insert("match-" + String(i).padStart(3, "0"), { cited: i === 0 });
  insert("wrong-workspace", { workspace: "target" });
  insert("wrong-engine", { engine: "gemini" });
  insert("wrong-prompt", { prompt: "alt" });
  insert("wrong-brand", { brand: "other" });
  insert("failed", { status: "failed" });
  insert("no-ai-answer", { hasAnswer: 0 });
  const query = "?workspace=source&engine=google&prompt_id=prompt&status=succeeded&brand_id=client&q=KEYWORD";
  const first = await (await call("/runs" + query)).json() as { runs: {id: string}[]; next_before: number; next_before_id: string };
  assert.equal(first.runs.length, 100);
  const second = await (await call(`/runs${query}&before=${first.next_before}&before_id=${first.next_before_id}`)).json() as { runs: {id: string}[]; next_before: null };
  assert.deepEqual(second.runs.map(run => run.id), ["match-002", "match-001", "match-000"]);
  assert.equal(second.next_before, null);
  const csv = await (await call("/export" + query)).text();
  assert.equal(csv.split("\r\n").length, 104);
  assert.match(csv, /match-000/);
  assert.doesNotMatch(csv, /wrong-workspace|wrong-brand|no-ai-answer/);
  await assert.rejects(call("/runs?workspace=foreign"), { status: 404 });
  await assert.rejects(call("/runs?engine=unknown"), { status: 400 });
});

test("a prompt move is tenant-scoped and keeps schedules and past runs in their proper scope", async () => {
  const { sql, env, call } = setup();
  env.CREDENTIALS_KEY = Buffer.alloc(32, 7).toString("base64");
  sql.prepare("INSERT INTO credentials VALUES('org',?,1,0)").run(await seal(env, "org", { login: "test", password: "fixture" }));
  sql.exec(`INSERT INTO schedules(id,org_id,prompt_id,preset,days,times_json,timezone,enabled,last_slot,created_at,batch_id)
    VALUES('sched','org','prompt','daily','[1]','["09:00"]','UTC',1,'2026-11-21@09:00',0,'batch')`);
  const original = await createRun(env, "org", "prompt", "old-workspace-run");
  const move = (ids: string[], workspace_id: string, user?: string) => call("/prompts/move", { ids, workspace_id }, user);
  await assert.rejects(move(["prompt"], "foreign"), { status: 404 });
  await assert.rejects(move(["prompt", "foreign-prompt"], "target"), { status: 404 });
  await assert.rejects(move(["prompt"], "target", "viewer"), { status: 403 });
  assert.equal(sql.prepare("SELECT workspace_id FROM prompts WHERE id='prompt'").get()?.workspace_id, "source");
  assert.deepEqual(await (await move(["prompt", "alt"], "target")).json(), { moved: 2 });
  assert.deepEqual(await (await move(["prompt", "alt"], "target")).json(), { moved: 0 });
  const after = await createRun(env, "org", "prompt", "new-workspace-run");
  assert.equal(after.workspace_id, "target");
  assert.equal(sql.prepare("SELECT workspace_id FROM runs WHERE id=?").get(String(original.id))?.workspace_id, "source");
  const schedule = sql.prepare("SELECT prompt_id,enabled,last_slot FROM schedules WHERE id='sched'").get();
  assert.equal(schedule?.prompt_id, "prompt");
  assert.equal(schedule?.enabled, 1);
  assert.equal(schedule?.last_slot, "2026-11-21@09:00");
});

test("All workspaces spans the organization and collection snapshots use only explicit workspace brands", async () => {
  const { sql, env, call } = setup();
  env.CREDENTIALS_KEY = Buffer.alloc(32, 7).toString("base64");
  sql.prepare("INSERT INTO credentials VALUES('org',?,1,0)").run(await seal(env, "org", { login: "test", password: "fixture" }));
  sql.exec("INSERT INTO prompts(id,org_id,workspace_id,text,created_at,updated_at) VALUES('target-prompt','org','target','Target prompt',0,0)");
  const source = await (await call("/brands", { name: "Source client", workspace_id: "source" })).json() as { id: string };
  const target = await (await call("/brands", { name: "Target client", workspace_id: "target" })).json() as { id: string };
  await call("/brands", { name: "Catalog only" });
  await assert.rejects(call("/prompts", { workspace_id: "source", brand_id: target.id, text: "Wrong client" }), { status: 404 });
  const single = await createRun(env, "org", "prompt", "source-brand-snapshot");
  const bulk = await createBulkRuns(env, "org", { prompt_ids: ["target-prompt"], batch_key: "target-brand-snapshot" });
  const ids = (run: Record<string, unknown>) => JSON.parse(String(run.config)).brands.map((brand: { id: string }) => brand.id);
  assert.deepEqual(ids(single), [source.id]);
  assert.deepEqual(ids(bulk.runs[0]), [target.id]);
  sql.prepare("DELETE FROM workspace_brands WHERE workspace_id='target'").run();
  assert.deepEqual(ids(await createRun(env, "org", "target-prompt", "empty-brand-snapshot")), []);

  const readPrompts = async (suffix = "") => (await (await call("/prompts?view=library" + suffix)).json() as {
    prompts: { workspace_id: string }[];
  }).prompts.map(prompt => prompt.workspace_id);
  assert.deepEqual(new Set(await readPrompts()), new Set(["source", "target"]));
  assert.deepEqual(await readPrompts("&workspace=target"), ["target"]);
});

test("resource edits and deletes preserve collected evidence and confine changes to the organization", async () => {
  const { sql, env, call } = setup();
  env.CREDENTIALS_KEY = Buffer.alloc(32, 7).toString("base64");
  sql.prepare("INSERT INTO credentials VALUES('org',?,1,0)").run(await seal(env, "org", { login: "test", password: "fixture" }));
  const { id: brand } = await (await call("/brands", { name: "Client", workspace_id: "source" })).json() as { id: string };
  await call("/workspaces/source", { name: "Renamed client", brand_id: brand }, "owner", "PATCH");
  await call("/brands/" + brand, { name: "Client renamed", kind: "client" }, "owner", "PATCH");
  await call("/prompts/prompt", { text: "Edited prompt", workspace_id: "source", brand_id: brand }, "owner", "PATCH");
  const run = await createRun(env, "org", "prompt", "keep-collected-history");
  sql.exec(`INSERT INTO schedules(id,org_id,prompt_id,preset,days,times_json,timezone,enabled,created_at,batch_id)
    VALUES('p-schedule','org','prompt','daily','[1]','["09:00"]','UTC',1,0,'batch'),
    ('a-schedule','org','alt','daily','[1]','["09:00"]','UTC',1,0,'batch')`);

  await assert.rejects(call("/prompts/bulk", { ids: ["prompt", "foreign-prompt"] }, "owner", "DELETE"), { status: 404 });
  await assert.rejects(call("/workspaces/source", undefined, "viewer", "DELETE"), { status: 403 });
  await assert.rejects(call("/workspaces/foreign", undefined, "owner", "DELETE"), { status: 404 });
  await call("/brands/" + brand, undefined, "owner", "DELETE");
  assert.equal(sql.prepare("SELECT brand_id FROM workspaces WHERE id='source'").get()?.brand_id, null);
  assert.equal(sql.prepare("SELECT brand_id FROM prompts WHERE id='prompt'").get()?.brand_id, null);
  await call("/prompts/bulk", { ids: ["prompt"] }, "owner", "DELETE");
  await assert.rejects(call("/prompts/prompt"), { status: 404 });
  await assert.rejects(createRun(env, "org", "prompt", "deleted-prompt-fails"), { status: 404 });
  assert.equal(sql.prepare("SELECT id FROM schedules WHERE id='p-schedule'").get(), undefined);
  await call("/workspaces/source", undefined, "owner", "DELETE");
  assert.equal(sql.prepare("SELECT id FROM schedules WHERE id='a-schedule'").get(), undefined);
  assert.equal((await (await call("/prompts?view=library")).json() as { prompts: unknown[] }).prompts.length, 0);
  const historical = await (await call("/runs?workspace=source")).json() as { runs: { id: string; config: { brands: { name: string }[] } }[] };
  assert.equal(historical.runs[0].id, run.id);
  assert.equal(historical.runs[0].config.brands[0].name, "Client renamed");
  assert.equal((await call("/runs/" + run.id)).status, 200);
  const { workspaces } = await (await call("/workspaces")).json() as { workspaces: { id: string }[] };
  assert.deepEqual(workspaces.map(workspace => workspace.id), ["target"]);
});

test("research drill-downs match exact stored source evidence across the selected workspace", async () => {
  const { sql, call } = setup();
  const insert = sql.prepare(`INSERT INTO runs(id,org_id,prompt_id,workspace_id,prompt_text,config,status,has_answer,citations,grounding_queries,idempotency_key,created_at,updated_at)
    VALUES(?,'org','prompt',?,'Question','{}','succeeded',?,?,?,?,100,100)`);
  const source = (url: string) => JSON.stringify([{ domain: "example.test", url }]);
  insert.run("matching", "source", 1, source("https://example.test/a"), '["compare source"]', "matching");
  insert.run("same-domain-other-page", "source", 1, source("https://example.test/b"), '["compare another"]', "other-page");
  insert.run("other-workspace", "target", 1, source("https://example.test/a"), '["compare source"]', "other-workspace");
  insert.run("no-answer", "source", 0, source("https://example.test/a"), '["compare source"]', "no-answer");
  const list = async (type: string, value: string) => {
    const query = new URLSearchParams({ workspace: "source", research_type: type, research_value: value });
    const result = await (await call("/runs?" + query)).json() as { runs: { id: string }[] };
    return result.runs.map(run => run.id);
  };
  assert.deepEqual(await list("domain", "example.test"), ["same-domain-other-page", "matching"]);
  assert.deepEqual(await list("page", "https://example.test/a"), ["matching"]);
  assert.deepEqual(await list("query", "compare source"), ["matching"]);
  await assert.rejects(call("/runs?research_type=domain"), { status: 400 });
});

test("prompt tags are workspace-scoped, editable and filterable through REST and MCP", async () => {
  const { sql, env, call } = setup();
  const { mcp } = await import("../src/server/mcp");
  const { hashToken } = await import("../src/server/crypto");
  const bulk = (ids: string[], action: string, tags: string[], user = "owner") =>
    call("/prompts/bulk-tags", { ids, action, tags }, user, "PATCH");
  const get = async (id: string) => (await (await call("/prompts/" + id)).json() as { prompt: { tags: string[] } }).prompt;
  const library = async (query: string) => (await (await call("/prompts?view=library&" + query)).json()) as {
    tags: string[]; prompts: { id: string; engine: string; tags: string[] }[];
  };

  assert.deepEqual((await get("prompt")).tags, []);
  assert.deepEqual(await (await bulk(["prompt", "alt"], "add", [" Alternatives ", "alternatives", "Seattle  Location"])).json(), { updated: 2 });
  await assert.rejects(bulk(["prompt", "foreign-prompt"], "remove", ["alternatives"]), { status: 404 });
  await assert.rejects(bulk(["prompt"], "remove", ["alternatives"], "viewer"), { status: 403 });
  assert.deepEqual((await get("prompt")).tags, ["alternatives", "seattle location"]);

  const command = { texts: ["Compare providers in Portland"], engines: ["chatgpt", "gemini"], workspace_id: "target" };
  await call("/prompts/bulk", { ...command, tags: ["Portland", "Brand Name"] });
  await call("/prompts/bulk", { ...command, tags: ["extra"] });
  assert.deepEqual((await library("workspace=target")).tags, ["brand name", "portland"]);
  assert.equal((await library("workspace=target&tag=brand+name")).prompts.length, 2);
  const edited = (await library("workspace=target&engine=gemini")).prompts[0];
  await call("/prompts/bulk", { ...command, engines: ["gemini"], source_id: edited.id, tags: [] });
  assert.deepEqual((await get(edited.id)).tags, []);
  assert.equal((await library("workspace=target&tag=brand+name")).prompts.length, 1);

  const single = { workspace_id: "target", text: "Sample for a single save", tags: ["Original tag"] };
  const created = await (await call("/prompts", single)).json() as { id: string };
  await call("/prompts/" + created.id, { workspace_id: single.workspace_id, text: "Updated sample" }, "owner", "PATCH");
  assert.deepEqual((await get(created.id)).tags, ["original tag"]);
  await call("/prompts/" + created.id, { ...single, tags: [] }, "owner", "PATCH");
  assert.deepEqual((await get(created.id)).tags, []);

  const scoped = await library("workspace=source&tag=SEATTLE+LOCATION&q=First");
  assert.deepEqual(scoped.tags, ["alternatives", "seattle location"]);
  assert.deepEqual(scoped.prompts.map(p => p.id), ["prompt"]);
  assert.equal((await library("workspace=source&tag=seattle")).prompts.length, 0);
  assert.deepEqual((await library("workspace=target&tag=seattle+location")).prompts, []);

  const key = "trk_prompt_tags_fixture";
  sql.prepare(`INSERT INTO api_keys(id,org_id,user_id,name,prefix,token_hash,scopes,expires_at,created_at)
    VALUES('tag-key','org','owner','Agent','trk',?,'["read","write"]',?,0)`).run(await hashToken(key), Date.now() + 60_000);
  async function invoke(name: string, args: unknown) {
    const request = new Request("https://example.test/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    });
    const payload = await (await mcp(request, env, { waitUntil() {} } as any)).json() as { result: { isError: boolean; content: { text: string }[] } };
    assert.equal(payload.result.isError, false, payload.result.content[0].text);
    return JSON.parse(payload.result.content[0].text);
  }
  await invoke("update_prompt_tags", { ids: ["alt"], action: "remove", tags: [" SEATTLE LOCATION "] });
  const page = await invoke("list_prompts", { workspace_id: "source", tag: "Seattle Location" });
  assert.deepEqual(page.prompts.map((p: {id: string}) => p.id), ["prompt"]);
  await invoke("save_prompts", { texts: ["A prompt from MCP"], engines: ["chatgpt"], workspace_id: "source", tags: ["From agent"] });
  assert.equal((await invoke("list_prompts", { tag: "from agent" })).prompts.length, 1);
  assert.deepEqual((await invoke("get_prompt", { id: "alt" })).prompt.tags, ["alternatives"]);

  const remaining = Array.from({ length: 19 }, (_, index) => `additional tag ${index}`);
  await bulk(["alt"], "add", remaining);
  await assert.rejects(bulk(["prompt", "alt"], "add", ["overflow"]), { status: 400 });
  assert.deepEqual((await get("prompt")).tags, ["alternatives", "seattle location"]);
  assert.equal((await get("alt")).tags.length, 20);
});


test("tier search windows apply to REST, research, export and MCP without deleting evidence", async () => {
  const { sql, env, call } = setup();
  const { mcp } = await import("../src/server/mcp");
  const { hashToken } = await import("../src/server/crypto");
  const { organizationPlan } = await import("../src/server/plans");
  const key = "trk_history_fixture";
  sql.prepare(`INSERT INTO api_keys(id,org_id,user_id,name,prefix,token_hash,scopes,expires_at,created_at)
    VALUES('history-key','org','owner','Agent','trk',?,'["read"]',?,0)`).run(await hashToken(key), Date.now()+60000);
  const insert = sql.prepare(`INSERT INTO runs(id,org_id,prompt_id,workspace_id,prompt_text,config,status,has_answer,citations,idempotency_key,created_at,updated_at)
    VALUES(?,'org','prompt','source','Question','{}','succeeded',1,'[{"domain":"example.test"}]',?,?,?)`);
  for (const [revision,days,checks] of [["starter-v2",30,10000],["agency-v1",90,60000],["scale-v1",180,250000]] as const) {
    const price = "price_"+revision;
    sql.prepare("INSERT INTO billing_prices VALUES(?,?,0)").run(price,revision);
    sql.prepare("UPDATE organization_plans SET plan_version_id=? WHERE org_id='org'").run(revision);
    sql.prepare("UPDATE billing_accounts SET status='active',price_id=?,updated_at=? WHERE org_id='org'").run(price,Date.now());
    sql.exec("DELETE FROM runs");
    const boundary = Date.now()-days*86400000;
    insert.run("inside","inside-"+revision,boundary+60000,boundary+60000);
    insert.run("outside","outside-"+revision,boundary-60000,boundary-60000);
    assert.equal((await organizationPlan(env,'org')).limits.runs_per_month,checks);
    for (const query of ["", "?research_type=domain&research_value=example.test"]) {
      const data = await (await call("/runs"+query)).json() as {runs:{id:string}[]};
      assert.deepEqual(data.runs.map(r=>r.id),["inside"]);
    }
    const csv=await (await call("/export")).text();
    assert.match(csv,/inside/); assert.doesNotMatch(csv,/outside/);
    assert.equal((await call("/runs/outside")).status,200,"direct evidence links are preserved");
    const request=new Request("https://example.test/mcp",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json",Accept:"application/json, text/event-stream"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"list_runs",arguments:{}}})});
    const payload=await (await mcp(request,env,{waitUntil(){}} as any)).json() as any;
    assert.equal(payload.result.isError,false,payload.result.content[0].text);
    assert.deepEqual(JSON.parse(payload.result.content[0].text).runs.map((r:any)=>r.id),["inside"]);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM runs").get()?.n,2);
  }
});
