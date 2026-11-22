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
  await call("/prompts/prompt", { brand_id: brand }, "owner", "PATCH");
  const saved = sql.prepare("SELECT text,engine FROM prompts WHERE id='prompt'").get()!;
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
  const { prompts: replacement } = await (await call("/prompts/bulk", {
    workspace_id: "source", texts: [saved.text], engines: [saved.engine],
  })).json() as { prompts: { id: string; outcome: string }[] };
  assert.notEqual(replacement[0].id, "prompt");
  assert.equal(replacement[0].outcome, "created");
  const retained = sql.prepare("SELECT prompt_id,prompt_text FROM runs WHERE id=?").get(String(run.id));
  assert.equal(retained?.prompt_id, "prompt");
  assert.equal(retained?.prompt_text, saved.text);
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
  const get = async (id: string) => (await (await call("/prompts/" + id)).json() as { prompt: { tags: string[]; text: string; location_name: string; language_code: string } }).prompt;
  const library = async (query: string) => (await (await call("/prompts?view=library&" + query)).json()) as {
    tags: string[]; prompts: { id: string; variants: { id: string }[] }[];
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
  assert.equal((await library("workspace=target&tag=brand+name")).prompts[0].variants.length, 2);
  const edited = (await library("workspace=target&engine=gemini")).prompts[0].variants[0];
  await call("/prompts/" + edited.id, { tags: [] }, "owner", "PATCH");
  assert.deepEqual((await get(edited.id)).tags, []);
  assert.equal((await library("workspace=target&tag=brand+name")).prompts.length, 1);

  const single = { workspace_id: "target", text: "Sample for a single save", tags: ["Original tag"] };
  const created = await (await call("/prompts", single)).json() as { id: string };
  await assert.rejects(call("/prompts/" + created.id, { text: "Updated sample", mode: "live" }, "owner", "PATCH"), { status: 400 });
  assert.equal((await get(created.id)).text, single.text);
  await call("/prompts/" + created.id, { location_name: "Canada", mode: "priority" }, "owner", "PATCH");
  assert.deepEqual((await get(created.id)).tags, ["original tag"]);
  assert.equal((await get(created.id)).location_name, "Canada");
  assert.equal((await get(created.id)).language_code, "en");
  await call("/prompts/" + created.id, { tags: [] }, "owner", "PATCH");
  assert.deepEqual((await get(created.id)).tags, []);

  const scoped = await library("workspace=source&tag=SEATTLE+LOCATION&q=First");
  assert.deepEqual(scoped.tags, ["alternatives", "seattle location"]);
  assert.deepEqual(scoped.prompts.flatMap(p => p.variants.map(v => v.id)), ["prompt"]);
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
  assert.deepEqual(page.prompts.flatMap((p: {variants: {id: string}[]}) => p.variants.map(v => v.id)), ["prompt"]);
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

test("bulk selection pages keep the same tenant and filters across REST and MCP", async () => {
  const { sql, env, call } = setup();
  const { mcp } = await import("../src/server/mcp");
  const { hashToken } = await import("../src/server/crypto");
  const insert = sql.prepare(`INSERT INTO prompts(id,org_id,workspace_id,text,created_at,updated_at,tags)
    VALUES(?, 'org', ?, 'Selection fixture ' || ?, 1, 1, ?)`);
  const expected = Array.from({ length: 1001 }, (_, index) => `match-${String(index).padStart(4, "0")}`);
  for (const id of expected) insert.run(id, "source", id, '["batch"]');
  insert.run("outside-workspace", "target", "other", '["batch"]');
  insert.run("outside-tag", "source", "other", "[]");
  sql.exec("UPDATE prompts SET tags='[\"batch\"]', text='Selection fixture' WHERE id='foreign-prompt'");
  sql.exec(`INSERT INTO schedules(id,org_id,prompt_id,preset,days,times_json,timezone,created_at)
    SELECT 's-' || id, org_id, id, 'daily', '[0]', '["09:00"]', 'UTC', 1 FROM prompts`);

  const key = "trk_bulk_selection_fixture";
  sql.prepare(`INSERT INTO api_keys(id,org_id,user_id,name,prefix,token_hash,scopes,expires_at,created_at)
    VALUES('selection-key','org','owner','Agent','trk',?,'["read","write"]',?,0)`).run(await hashToken(key), Date.now() + 60_000);
  async function tool(name: string, args: object, isError = false) {
    const request = new Request("https://example.test/mcp", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    });
    const { result } = await (await mcp(request, env, { waitUntil() {} } as any)).json() as {
      result: { isError: boolean; content: { text: string }[] };
    };
    assert.equal(result.isError, isError, result.content[0].text);
    const content = result.content[0].text;
    return content.startsWith("{") ? JSON.parse(content) : content;
  }

  const query = "/prompts?view=library&workspace=source&tag=batch&q=selection";
  const page: any = await (await call(query + "&limit=20")).json();
  assert.equal(page.total, 1001);
  assert.equal(page.prompts.length, 20);
  const matching = { workspace_id: "source", tag: "batch", q: "selection", selection: true };
  const first: any = await (await call(query + "&selection=1")).json();
  assert.equal(first.prompts.length, 1000);
  assert.deepEqual(first.prompts[0].variants[0], { id: expected.at(-1), workspace_id: "source" });
  const last = await tool("list_prompts", { ...matching, ...first.next_cursor });
  assert.equal(last.next_cursor, null);
  assert.deepEqual([...first.prompts, ...last.prompts].map(row => row.variants[0].id), [...expected].reverse());
  await assert.rejects(call(query + "&limit=101"), { status: 400 });
  await assert.rejects(call(query + "&selection=1&before=1"), { status: 400 });

  sql.exec(`UPDATE prompts SET text='Selection fixture',engine='gemini' WHERE id='match-1000';
    UPDATE prompt_engines SET question_id=(SELECT question_id FROM prompts WHERE id='match-1000')
      WHERE id LIKE 'match-%' AND id<>'match-0000';`);
  const grouped = await tool("list_prompts", { ...matching, selection: false, limit: 1 });
  assert.equal(grouped.total, 2);
  assert.equal(grouped.prompts.length, 1);
  assert.equal(grouped.prompts[0].variants.length, 1000);
  const nextGroup = await (await call(query + "&limit=1&" +
    new URLSearchParams(grouped.next_cursor), undefined, "viewer")).json() as {
      prompts: { variants: { id: string }[] }[]; next_cursor: unknown;
    };
  assert.deepEqual(nextGroup.prompts.map(group => group.variants.map(variant => variant.id)), [["match-0000"]]);
  assert.equal(nextGroup.next_cursor, null);
  const byEngine = await tool("list_prompts", { ...matching, engine: "gemini" });
  assert.deepEqual(byEngine.prompts[0].variants, [{ id: "match-1000", workspace_id: "source" }]);

  const question = grouped.prompts[0];
  await assert.rejects(call("/prompt-questions/" + question.id, { text: "Selection blocked" }, "owner", "PATCH"), { status: 404 });
  assert.equal(sql.prepare("SELECT count(*) AS n FROM prompts WHERE question_id=? AND text='Selection fixture'").get(question.id)?.n, 1000);
  assert.deepEqual(sql.prepare("PRAGMA foreign_key_check").all(), []);

  const schedulePage = await tool("list_schedules", { workspace_id: "source", limit: 20 });
  assert.equal(schedulePage.total, 1004);
  assert.equal(schedulePage.schedules.length, 20);
  const selectedSchedules: any = await (await call("/schedules?workspace=source&selection=1")).json();
  const rest = await tool("list_schedules", {
    workspace_id: "source", selection: true, ...selectedSchedules.next_cursor,
  });
  const schedules = [...selectedSchedules.schedules, ...rest.schedules];
  assert.equal(new Set(schedules.map(row => row.id)).size, 1004);
  assert.ok(schedules.every(row => row.id !== "s-foreign-prompt" && row.id !== "s-outside-workspace"));
  assert.equal(rest.next_cursor, null);

  await assert.rejects(call("/prompts/bulk-settings", { ids: [expected[0]], mode: "priority" }, "viewer", "PATCH"), { status: 403 });
  assert.equal((await tool("update_prompt_settings", { ids: [expected[0], "foreign-prompt"], mode: "priority" }, true)).status, 404);
  assert.match(String(await tool("rename_prompt_question", { question_id: question.id, text: "Selection blocked" }, true)), /rename_prompt_question/);
  assert.match(String(await tool("update_prompt_settings", { ids: [expected[0]], text: "Selection blocked" }, true)), /text/);
  assert.match(String(await tool("save_prompts", {
    workspace_id: "source", engines: ["chatgpt"], texts: ["Selection blocked"], source_id: expected[0],
  }, true)), /source_id/);
  assert.equal((await tool("update_prompt_settings", { ids: [expected[0]], location_name: "unsupported location" }, true)).status, 400);
  assert.deepEqual(await tool("update_prompt_settings", { ids: expected.slice(0, 100), mode: "priority", location_name: "Canada" }), { updated: 100 });
  assert.equal(sql.prepare("SELECT location_name FROM prompts WHERE id=?").get(expected[0])?.location_name, "Canada");
  assert.equal(sql.prepare("SELECT text FROM prompts WHERE id=?").get(expected[0])?.text, "Selection fixture match-0000");
  assert.deepEqual(await tool("move_prompts", { ids: [expected[0]], workspace_id: "target" }), { moved: 1 });
  assert.deepEqual(await tool("delete_prompts", { ids: [expected[1]] }), { deleted: 1 });
  const remaining: any = await (await call(query + "&limit=20")).json();
  assert.equal(remaining.total, 1);
  assert.equal(remaining.prompts[0].variants.length, 999);
});

test("prompt sets validate whole selections, support overlap and clear membership on moves and archives", async () => {
  const { sql, call } = setup();
  const create = (name: string, prompt_ids: string[]) => call("/prompt-sets", { name, workspace_id: "source", prompt_ids });
  const list = async () => (await (await call("/prompt-sets?workspace=source", undefined, "viewer")).json() as any).sets;
  await assert.rejects(create("Invalid", ["prompt", "foreign-prompt"]), { status: 404 });
  assert.deepEqual(await list(), []);
  const { id } = await (await create("Local discovery", ["prompt", "prompt", "alt"])).json() as any;
  const other = await (await create("Consideration", ["prompt"])).json() as any;
  const update = (action: string, prompt_ids: string[], user?: string) =>
    call(`/prompt-sets/${id}/members`, { action, prompt_ids }, user, "PATCH");
  assert.equal((await (await update("add", ["prompt"])).json() as any).changed, 0);
  await assert.rejects(update("remove", ["alt", "foreign-prompt"]), { status: 404 });
  await assert.rejects(update("remove", ["alt"], "viewer"), { status: 403 });
  const library = await (await call(`/prompts?view=library&set=${id}&selection=1`, undefined, "viewer")).json() as any;
  assert.equal(library.prompts.length, 2);
  await assert.rejects(call(`/prompts?workspace=target&set=${id}`), { status: 404 });
  await call(`/prompt-sets/${id}`, { name: "Renamed" }, undefined, "PATCH");
  assert.equal((await list()).find((set: any) => set.id === id).name, "Renamed");
  await call("/prompts/move", { ids: ["prompt"], workspace_id: "target" });
  assert.equal((await list()).find((set: any) => set.id === other.id).member_count, 0);
  assert.equal((await list()).find((set: any) => set.id === id).member_count, 1);
  await assert.rejects(update("add", ["prompt"]), { status: 404 });
  await call(`/prompt-sets/${id}`, undefined, undefined, "DELETE");
  assert.equal(sql.prepare("SELECT count(*) AS n FROM prompts WHERE id='alt' AND archived_at IS NULL").get()?.n, 1);
  await call("/workspaces/source", undefined, undefined, "DELETE");
  assert.equal(sql.prepare("SELECT count(*) AS n FROM prompt_sets WHERE org_id='org'").get()?.n, 0);
});

test("full-period analytics reconciles with paged run history, research, and CSV", async () => {
  const { sql, call } = setup();
  sql.exec("UPDATE organization_plans SET plan_version_id='starter-v2' WHERE org_id='org'");
  sql.exec("UPDATE billing_accounts SET status='active',price_id='price_test',updated_at=unixepoch()*1000 WHERE org_id='org'");
  sql.exec(`UPDATE prompts SET tags='["consideration","chicago-market"]' WHERE id='prompt'`);
  const create = (name: string) => call("/prompt-sets", { name, workspace_id: "source", prompt_ids: ["prompt", "alt"] });
  const { id } = await (await create("Local discovery")).json() as any;
  await create("Overlapping");
  const fixtureRun = sql.prepare(`INSERT INTO runs(id,org_id,prompt_id,workspace_id,prompt_text,created_at,updated_at,
    config,status,has_answer,mentions,citations,grounding_queries,idempotency_key)
    VALUES(?,'org','prompt',?,'Recorded prompt',?,?,?,?,?,?,?,?,?)`);
  const time = Date.now();
  const write = (id: string, { location = "Chicago", tracked = true, mention = true, cited = false, hasAnswer = 1,
    age = 0, workspace = "source" } = {}) =>
    fixtureRun.run(id, workspace, time - age * 86400000, time,
      JSON.stringify({ engine: "google", location_name: location, brands: tracked ? [{ id: "client" }] : [] }),
      "succeeded", hasAnswer,
      JSON.stringify([{ brand_id: "client", mentioned: mention, cited }]),
      JSON.stringify([{ domain: "example.test", url: "https://example.test/", title: "Example" }]),
      '["chicago","chicago"]', id);
  for (let index = 0; index < 102; index++) write("sample-" + index, { mention: index < 101, cited: index === 101 });
  write("untracked", { tracked: false });
  write("no-answer", { hasAnswer: 0 });
  write("old", { age: 45 });
  write("elsewhere", { location: "Seattle" });
  write("other-workspace", { workspace: "target" });
  const start = new Date(time - 90 * 86400000).toISOString().slice(0, 10);
  const filters = `workspace=source&set=${id}&tags=consideration,chicago-market&engine=google&location=chicago&from=${start}&tracked_brand=client`;
  const get = async (path: string) => await (await call(path)).json() as any;
  const report = await get("/analytics?" + filters);
  assert.equal(report.selected_prompts, 1);
  assert.equal(report.covered_prompts, 1);
  assert.equal(report.total_runs, 104);
  assert.equal(report.eligible_answers, 103);
  assert.deepEqual(report.brands, [{ id: "client", samples: 102, mentions: 101, citations: 1 }]);
  assert.equal(report.daily.reduce((count: number, day: any) => count + day.samples, 0), 102);
  const matches = "/runs?" + filters + "&metric=mention";
  const first = await get(matches);
  const last = await get(matches + `&before=${first.next_before}&before_id=${first.next_before_id}`);
  assert.equal(first.runs.length + last.runs.length, 101);
  assert.equal(last.runs.length, 1);
  assert.equal((await get("/runs?" + filters + "&metric=citation")).runs[0].id, "sample-101");
  const csv = await (await call("/export?" + filters + "&metric=brand")).text();
  assert.equal(csv.split("\r\n").length, 103);
  assert.doesNotMatch(csv, /untracked|no-answer|elsewhere|other-workspace/);
  const summary = await get("/research?" + filters);
  assert.equal(summary.answers, 103);
  assert.equal(summary.items.find((item: any) => item.kind === "query").count, 103);
  assert.equal((await get("/runs?" + filters + "&research_type=domain&research_value=example.test")).runs.length, 100);
  assert.equal((await get("/analytics?workspace=source&from=" + start)).total_runs, 105);
  await call("/prompts/bulk-tags", { ids: ["prompt"], tags: ["chicago-market"], action: "remove" }, undefined, "PATCH");
  assert.equal((await get("/analytics?" + filters)).total_runs, 0);
  await call("/prompts/move", { ids: ["prompt"], workspace_id: "target" });
  assert.equal((await get("/analytics?workspace=source&set=" + id)).total_runs, 0);
  assert.equal((await get("/analytics?workspace=source")).total_runs, 105);
  assert.equal((await get("/analytics?workspace=target")).total_runs, 1);
  await assert.rejects(call("/analytics?workspace=foreign"), { status: 404 });
  await assert.rejects(call("/analytics?from=2026-02-30"), { status: 400 });
});

test("comparison rates, outcome counts and matching evidence use recorded run cohorts across REST and MCP", async () => {
  const { sql, env, call } = setup();
  const { mcp } = await import("../src/server/mcp");
  const { hashToken } = await import("../src/server/crypto");
  const key = "trk_comparison_fixture";
  sql.prepare(`INSERT INTO api_keys(id,org_id,user_id,name,prefix,token_hash,scopes,expires_at,created_at)
    VALUES('comparison-key','org','owner','Agent','trk',?,'["read"]',?,0)`).run(await hashToken(key), Date.now() + 60000);
  const later = Date.now();
  const earlier = later - 86400000;
  const from = new Date(earlier).toISOString().slice(0, 10);
  const to = new Date(later).toISOString().slice(0, 10);
  const insert = sql.prepare(`INSERT INTO runs(id,org_id,prompt_id,workspace_id,prompt_text,config,status,
    has_answer,mentions,organic_results,idempotency_key,created_at,updated_at)
    VALUES(?,'org','prompt','source','Question',?,?,?,?,?,?,?,?)`);
  function run(id: string, time: number, {
    status = "succeeded", answer = 1, organic = false, competitor = true, engine = "google",
    mention = false, cite = false, competitorCite = false,
  } = {}) {
    const brands = [{ id: "client" }, ...(competitor ? [{ id: "rival" }] : [])];
    const mentions = [{ brand_id: "client", mentioned: mention, cited: cite }, { brand_id: "rival", cited: competitorCite }];
    insert.run(id, JSON.stringify({ engine, brands }), status, answer, JSON.stringify(mentions), organic ? "[{}]" : "[]", id, time, time);
  }
  run("before-rival", earlier, { competitor: false, mention: true, competitorCite: true });
  run("both-cited", later, { cite: true, competitorCite: true });
  run("both-unmentioned", later);
  run("organic-only", later, { answer: 0, organic: true });
  run("no-answer", later, { answer: 0 });
  run("failed", later, { status: "failed" });
  run("other-engine", later, { engine: "gemini" });
  const filters = { workspace: "source", from, to, engine: "google", tracked_brand: "client", compare_brand: "rival" };
  const rest = (path: string, extra: Record<string, string> = {}) => call(path + "?" + new URLSearchParams({ ...filters, ...extra }));
  async function tool(name: string, extra: Record<string, string> = {}) {
    const { workspace, ...args } = filters;
    const request = new Request("https://example.test/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: { workspace_id: workspace, ...args, ...extra } } }),
    });
    const payload = await (await mcp(request, env, { waitUntil() {} } as any)).json() as any;
    assert.equal(payload.result.isError, false, payload.result.content[0].text);
    return payload.result.content[0].text;
  }
  const report = await (await rest("/analytics")).json() as any;
  assert.deepEqual(JSON.parse(await tool("get_overview")), report);
  assert.deepEqual(report.outcomes, { eligible: 3, failed: 1, no_answer: 1, organic: 1 });
  assert.equal(report.total_runs, 6);
  assert.equal(report.daily.reduce((sum: number, day: any) => sum + day.samples, 0), 3);
  assert.deepEqual(report.comparison_daily, [{
    day: to, samples: 2, mentions: 0, citations: 1, compare_mentions: 0, compare_citations: 1,
  }]);
  for (const [metric, ids] of Object.entries({
    brand: ["both-unmentioned", "both-cited"], mention: [],
    citation: ["both-cited"], compare_citation: ["both-cited"],
  })) {
    const history = await (await rest("/runs", { metric })).json() as any;
    assert.deepEqual(history.runs.map((row: any) => row.id), ids);
    assert.deepEqual(JSON.parse(await tool("list_runs", { metric })), history);
    const csv = await (await rest("/export", { metric })).text();
    assert.equal(await tool("export_runs", { metric }), csv);
    assert.equal(csv.split("\r\n").length, ids.length + 1);
  }
  for (const [outcome, id] of [["organic", "organic-only"], ["no_answer", "no-answer"], ["failed", "failed"]]) {
    const { runs } = await (await rest("/runs", { outcome })).json() as any;
    assert.deepEqual(runs.map((row: any) => row.id), [id]);
  }
  assert.deepEqual((await (await rest("/analytics", { to: from })).json() as any).comparison_daily, []);
  await assert.rejects(rest("/analytics", { compare_brand: "client" }), { status: 400 });
  await assert.rejects(rest("/runs", { compare_brand: "", metric: "compare_mention" }), { status: 400 });
  await assert.rejects(rest("/runs", { workspace: "foreign", metric: "brand" }), { status: 404 });
});
