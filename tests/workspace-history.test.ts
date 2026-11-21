import assert from "node:assert/strict";
import { test } from "node:test";
import { api } from "../src/server/api";
import { seal } from "../src/server/crypto";
import { createRun } from "../src/server/provider";
import { fixture } from "./helpers/billing-fixture";

function setup() {
  const { sql, env } = fixture();
  sql.exec(`INSERT INTO user VALUES('owner','Owner','owner@example.test',1,NULL,0,0),('viewer','Viewer','viewer@example.test',1,NULL,0,0);
    INSERT INTO memberships VALUES('org','owner','owner',0),('org','viewer','viewer',0);
    INSERT INTO organizations(id,name,created_at) VALUES('other','Other',0);
    INSERT INTO workspaces(id,org_id,name,created_at) VALUES('source','org','Source',0),('target','org','Target',0),('foreign','other','Foreign',0);
    INSERT INTO prompts(id,org_id,workspace_id,text,created_at,updated_at) VALUES
      ('prompt','org','source','First question',0,0),('alt','org','source','Other question',0,0),('foreign-prompt','other','foreign','Foreign question',0,0);`);
  const call = (path: string, body?: unknown, userId = "owner") => api(
    new Request("https://example.test/api/v1" + path, {
      method: body ? "POST" : "GET",
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
  sql.exec(`INSERT INTO schedules(id,org_id,prompt_id,preset,days,local_time,timezone,enabled,last_slot,created_at)
    VALUES('sched','org','prompt','daily','[1]','09:00','UTC',1,'2026-11-21',0)`);
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
  assert.equal(schedule?.last_slot, "2026-11-21");
});
