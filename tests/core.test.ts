import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { api } from "../src/server/api";
import { auth, authenticate } from "../src/server/auth";
import { seal, unseal } from "../src/server/crypto";
import {
  normalize,
  providerPayload,
  createRun,
  executeRun,
  collectRun,
  type Config,
} from "../src/server/provider";
import { scheduleDue, localSlot } from "../src/server/scheduler";
import type { Env, Ctx, Principal } from "../src/server/types";
class Statement {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private args: unknown[] = [],
  ) {}
  bind(...args: unknown[]) {
    return new Statement(this.db, this.sql, args);
  }
  first() {
    return this.db.prepare(this.sql).get(...(this.args as any[])) || null;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...(this.args as any[])) };
  }
  async raw() { return this.db.prepare(this.sql).all(...(this.args as any[])).map(row => Object.values(row)); }
  run() {
    const r = this.db.prepare(this.sql).run(...(this.args as any[]));
    return { success: true, meta: { changes: Number(r.changes) } };
  }
}
function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(
    readFileSync(
      new URL("../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  sql.exec(
    readFileSync(
      new URL("../migrations/0002_workflow_dispatch.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const id of ["alice", "bob", "eve"])
    sql
      .prepare("INSERT INTO user VALUES(?,?,?,1,NULL,?,?)")
      .run(id, id, id + "@example.test", Date.now(), Date.now());
  sql.exec(
    readFileSync(
      new URL("../migrations/0003_workspace_brands.sql", import.meta.url),
      "utf8",
    ),
  );
  sql.exec(readFileSync(new URL("../migrations/0004_versioned_plans.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0005_recipient_invitations.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0006_stripe_billing.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0007_billing_operations.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0011_run_admission_accounting.sql", import.meta.url), "utf8"));
  const db = {
    prepare: (s: string) => new Statement(sql, s),
    batch: async (stmts: Statement[]) => {
      sql.exec("BEGIN");
      try {
        const r = stmts.map((s) => s.run());
        sql.exec("COMMIT");
        return r;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const objects = new Map<string, string>();
  const env = {
    DB: db,
    ANSWERS: {
      put: async (k: string, v: string) => objects.set(k, v),
      get: async (k: string) =>
        objects.has(k) ? { text: async () => objects.get(k) } : null,
    },
    BASE_URL: "https://trackrank.ai",
    AUTH_SECRET: "test-auth-secret-that-is-long-enough",
    CREDENTIALS_KEY: Buffer.alloc(32, 7).toString("base64"),
    RUN_WORKFLOW: { create: async () => ({}) },
  } as unknown as Env;
  return { env, sql, objects };
}
const ctx = { waitUntil: () => {} } as unknown as Ctx;
test("saved prompt links enforce organization membership and allow viewers to read", async () => {
  const { env, sql } = fixture();
  const owned = await organization(env, "alice");
  const other = await organization(env, "eve");
  sql.prepare("INSERT INTO memberships VALUES(?,?,?,?)").run(owned.id, "bob", "viewer", Date.now());
  const created = await call(env, { userId: "alice" }, "/prompts", "POST", {
    workspace_id: owned.workspace_id, text: "A shared prompt",
  }, owned.id);
  const { id } = await created.json() as { id: string };
  const detail = await call(env, { userId: "bob" }, "/prompts/" + id, "GET", undefined, owned.id);
  assert.equal((await detail.json() as { prompt: { text: string } }).prompt.text, "A shared prompt");
  await assert.rejects(call(env, { userId: "eve" }, "/prompts/" + id, "GET", undefined, owned.id), { status: 403 });
  await assert.rejects(call(env, { userId: "eve" }, "/prompts/" + id, "GET", undefined, other.id), { status: 404 });
});

async function call(
  env: Env,
  p: Principal,
  path: string,
  method = "GET",
  data?: unknown,
  org?: string,
) {
  return api(
    new Request(
      "https://trackrank.ai/api/v1" +
        path +
        (org ? (path.includes("?") ? "&" : "?") + "org=" + org : ""),
      {
        method,
        headers: { "Content-Type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      },
    ),
    env,
    ctx,
    p,
  );
}
async function organization(env: Env, user = "alice") {
  const r = await call(env, { userId: user }, "/organizations", "POST", {
    name: user + " org",
  });
  return r.json() as Promise<{ id: string; workspace_id: string }>;
}
async function setupPrompt(env: Env, user = "alice") {
  const o = await organization(env, user);
  await call(
    env,
    { userId: user },
    "/credentials",
    "PUT",
    { login: "api@example.test", password: "test-provider-password" },
    o.id,
  );
  const b = await call(
    env,
    { userId: user },
    "/brands",
    "POST",
    { name: "Acme", domain: "acme.test" },
    o.id,
  );
  const brand = (await b.json()) as { id: string };
  const p = await call(
    env,
    { userId: user },
    "/prompts",
    "POST",
    {
      workspace_id: o.workspace_id,
      brand_id: brand.id,
      text: "Best software tools?",
      engine: "chatgpt",
    },
    o.id,
  );
  const prompt = (await p.json()) as { id: string };
  return { ...o, promptId: prompt.id, brandId: brand.id };
}
const config: Config = {
  engine: "chatgpt",
  mode: "standard",
  location_name: "Seattle,Washington,United States",
  language_code: "en",
  resolve_poisoned_results: true,
  brands: [
    {
      id: "a",
      name: "Acme",
      domain: "acme.test",
      aliases: '["Acme Labs"]',
      kind: "own",
    },
    {
      id: "b",
      name: "Ace",
      domain: "ace.test",
      aliases: "[]",
      kind: "competitor",
    },
  ],
};
test("encryption is tenant-bound and authenticated", async () => {
  const { env } = fixture();
  const encrypted = await seal(env, "org-a", { password: "supersecret" });
  assert.ok(!encrypted.includes("supersecret"));
  assert.deepEqual(await unseal(env, "org-a", encrypted), {
    password: "supersecret",
  });
  await assert.rejects(unseal(env, "org-b", encrypted));
});
test("normalizes answers, safe citations, grounding and brands without substring matches", () => {
  const n = normalize(
    {
      items: [
        {
          type: "chat_gpt_text",
          markdown: "ACME Labs offers tools. Palace is not our competitor.",
          sources: [
            { url: "https://docs.acme.test/guide", title: "Guide" },
            { url: "javascript:alert(1)" },
          ],
          brand_entities: [{ title: "Acme" }],
        },
      ],
      fan_out_queries: ["best tools", "best tools"],
    },
    config,
  );
  assert.equal(n.mentions[0].mentioned, true);
  assert.equal(n.mentions[0].cited, true);
  assert.equal(n.mentions[1].mentioned, false);
  assert.equal(n.citations.length, 1);
  assert.deepEqual(n.grounding_queries, ["best tools"]);
  assert.equal(n.discovered_brands[0].name, "Acme");
});
test("organic listings never inflate AI answer/citation rates", () => {
  const n = normalize(
    {
      items: [
        {
          type: "organic",
          title: "Acme tools",
          description: "Acme is great",
          url: "https://acme.test",
          rank_group: 1,
        },
      ],
    },
    { ...config, engine: "google" },
  );
  assert.equal(n.has_answer, false);
  assert.equal(n.citations.length, 0);
  assert.equal(n.organic_results.length, 1);
  assert.equal(n.mentions[0].mentioned, false);
});
test("Google AI Overview parses references separately from organic listings", () => {
  const n = normalize(
    {
      items: [
        { type: "organic", url: "https://other.test", rank_group: 1 },
        {
          type: "ai_overview",
          items: [{ type: "ai_overview_element", text: "Acme can help." }],
          references: [{ url: "https://acme.test/list", title: "Useful list" }],
        },
      ],
    },
    { ...config, engine: "google" },
  );
  assert.equal(n.has_answer, true);
  assert.equal(n.citations[0].domain, "acme.test");
  assert.equal(n.organic_results.length, 1);
});
test("provider payload uses scraper and clean SERPs defaults, preserving special characters", () => {
  const p = providerPayload(
    "C++ 100%",
    { ...config, engine: "google", mode: "priority" },
    "r",
  );
  assert.equal(p.priority, 2);
  assert.equal(p.resolve_poisoned_results, true);
  assert.equal(p.load_async_ai_overview, true);
  assert.equal(p.depth, 10);
  assert.equal(p.keyword, "C%2B%2B 100%25");
});
test("scheduler observes timezone, selected weekdays and same-day idempotency", () => {
  const s = {
    timezone: "America/Los_Angeles",
    local_time: "09:00",
    days: "[1,3,5]",
    last_slot: null,
  };
  assert.equal(scheduleDue(s, new Date("2026-11-20T17:05:00Z")), "2026-11-20");
  assert.equal(
    scheduleDue(
      { ...s, last_slot: "2026-11-20" },
      new Date("2026-11-20T18:00:00Z"),
    ),
    null,
  );
  assert.equal(scheduleDue(s, new Date("2026-11-21T19:00:00Z")), null);
  assert.equal(
    localSlot(new Date("2026-07-20T16:00:00Z"), "America/Los_Angeles").time,
    "09:00",
  );
});
test("organizations get a default workspace; cross-tenant IDs fail at API and DB boundaries", async () => {
  const { env, sql } = fixture();
  const a = await setupPrompt(env),
    b = await organization(env, "bob");
  assert.equal(
    (
      (await (
        await call(
          env,
          { userId: "alice" },
          "/workspaces",
          "GET",
          undefined,
          a.id,
        )
      ).json()) as any
    ).workspaces.length,
    1,
  );
  await assert.rejects(
    call(env, { userId: "bob" }, "/prompts", "GET", undefined, a.id),
    /access denied/,
  );
  await assert.rejects(
    call(
      env,
      { userId: "alice" },
      "/prompts",
      "POST",
      { workspace_id: b.workspace_id, text: "Test prompt" },
      a.id,
    ),
    /Not found/,
  );
  assert.throws(
    () =>
      sql
        .prepare(
          "INSERT INTO prompts(id,org_id,workspace_id,text,created_at,updated_at) VALUES('bad',?,?,?,1,1)",
        )
        .run(a.id, b.workspace_id, "bad"),
    /FOREIGN KEY/,
  );
});
test("viewer cannot mutate, a scoped key cannot escape its org, and revocation is immediate", async () => {
  const { env, sql } = fixture();
  const a = await setupPrompt(env),
    b = await organization(env, "bob");
  sql
    .prepare("INSERT INTO memberships VALUES(?,?,'viewer',?)")
    .run(a.id, "eve", Date.now());
  await assert.rejects(
    call(env, { userId: "eve" }, "/brands", "POST", { name: "bad" }, a.id),
    /read-only/,
  );
  const kr = await call(
    env,
    { userId: "alice" },
    "/keys",
    "POST",
    { name: "Read only", scopes: ["read"] },
    a.id,
  );
  const { key, id } = (await kr.json()) as any;
  const p = await authenticate(
    new Request("https://trackrank.ai", {
      headers: { Authorization: "Bearer " + key },
    }),
    env,
  );
  await assert.rejects(
    call(env, p, "/prompts", "GET", undefined, b.id),
    /access denied/,
  );
  await assert.rejects(
    call(env, p, "/prompts/" + a.promptId + "/run", "POST", {}),
    /run scope/,
  );
  await call(
    env,
    { userId: "alice" },
    "/keys/" + id,
    "DELETE",
    undefined,
    a.id,
  );
  await assert.rejects(
    authenticate(
      new Request("https://trackrank.ai", {
        headers: { Authorization: "Bearer " + key },
      }),
      env,
    ),
    /expired or revoked/,
  );
  assert.notEqual(
    sql.prepare("SELECT token_hash FROM api_keys WHERE id=?").get(id)
      ?.token_hash,
    key,
  );
});
test("API keys cannot mint other keys or inspect credentials; role removal kills access", async () => {
  const { env, sql } = fixture();
  const a = await setupPrompt(env);
  const kr = await call(
    env,
    { userId: "alice" },
    "/keys",
    "POST",
    { name: "Full agent", scopes: ["read", "write", "run"] },
    a.id,
  );
  const { key } = (await kr.json()) as any;
  const req = new Request("https://trackrank.ai", {
    headers: { Authorization: "Bearer " + key },
  });
  const p = await authenticate(req, env);
  await assert.rejects(
    call(env, p, "/keys", "POST", { name: "escape", scopes: ["read"] }),
    /administrator session/,
  );
  await assert.rejects(
    call(env, p, "/credentials", "PUT", { login: "x", password: "x" }),
    /administrator session/,
  );
  sql
    .prepare("DELETE FROM memberships WHERE org_id=? AND user_id='alice'")
    .run(a.id);
  await assert.rejects(authenticate(req, env), /expired or revoked/);
});
test("invitations are hashed, one-use, role-scoped, and cannot overwrite owner", async () => {
  const { env, sql } = fixture();
  const a = await organization(env);
  const r = await call(
    env,
    { userId: "alice" },
    "/invites",
    "POST",
    { role: "member", email: "bob@example.test" },
    a.id,
  );
  const { url } = (await r.json()) as any;
  const raw = new URLSearchParams(new URL(url).hash.slice(1)).get("invite");
  assert.ok(raw);
  assert.notEqual(
    sql.prepare("SELECT token_hash FROM invites").get()?.token_hash,
    raw,
  );
  await call(env, { userId: "bob" }, "/invites/accept", "POST", { token: raw });
  assert.equal(
    sql
      .prepare("SELECT role FROM memberships WHERE org_id=? AND user_id='bob'")
      .get(a.id)?.role,
    "member",
  );
  await assert.rejects(
    call(env, { userId: "eve" }, "/invites/accept", "POST", { token: raw }),
    /expired or already used/,
  );
  await assert.rejects(
    call(env, { userId: "alice" }, "/members/alice", "DELETE", undefined, a.id),
    /owner/,
  );
});
test("idempotent runs reserve at most once and ignore legacy daily caps", async () => {
  const { env, sql } = fixture();
  const a = await setupPrompt(env);
  sql
    .prepare("UPDATE organizations SET daily_run_ceiling=1 WHERE id=?")
    .run(a.id);
  const r1 = await createRun(env, a.id, a.promptId, "same-key-123"),
    r2 = await createRun(env, a.id, a.promptId, "same-key-123");
  assert.equal(r1.id, r2.id);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM runs").get()?.n, 1);
  const other = await createRun(env, a.id, a.promptId, "other-key-123");
  assert.notEqual(other.id, r1.id);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM runs").get()?.n, 2);
});
test("standard async execution stores task correlation and collects raw evidence without resubmission", async () => {
  const { env, objects } = fixture();
  const a = await setupPrompt(env),
    r = await createRun(env, a.id, a.promptId, "async-test-key");
  const original = globalThis.fetch;
  let posts = 0;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts++;
      const payload = JSON.parse(init.body as string);
      assert.match(payload[0].pingback_url, /signature=/);
      return Response.json({
        status_code: 20000,
        tasks: [{ id: "external-1", status_code: 20100, cost: 0.001 }],
      });
    }
    return Response.json({
      status_code: 20000,
      tasks: [
        {
          id: "external-1",
          status_code: 20000,
          cost: 0.001,
          result: [
            {
              items: [
                {
                  type: "chat_gpt_text",
                  markdown: "Acme is an option.",
                  sources: [{ url: "https://acme.test" }],
                },
              ],
            },
          ],
        },
      ],
    });
  }) as typeof fetch;
  try {
    await executeRun(env, String(r.id));
    await executeRun(env, String(r.id));
    const submitted = (await env.DB.prepare("SELECT * FROM runs WHERE id=?")
      .bind(r.id)
      .first()) as any;
    assert.equal(submitted.status, "submitted");
    await collectRun(env, submitted);
    const done = (await env.DB.prepare("SELECT * FROM runs WHERE id=?")
      .bind(r.id)
      .first()) as any;
    assert.equal(done.status, "succeeded");
    assert.equal(done.has_answer, 1);
    assert.equal(posts, 1);
    assert.equal(objects.size, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("ambiguous network submission is not retried or charged twice", async () => {
  const { env } = fixture();
  const a = await setupPrompt(env),
    r = await createRun(env, a.id, a.promptId, "network-test-key");
  const original = globalThis.fetch;
  let n = 0;
  globalThis.fetch = (async () => {
    n++;
    throw new TypeError("connection lost");
  }) as typeof fetch;
  try {
    await executeRun(env, String(r.id));
    await executeRun(env, String(r.id));
    const row = (await env.DB.prepare("SELECT status FROM runs WHERE id=?")
      .bind(r.id)
      .first()) as any;
    assert.equal(row.status, "uncertain");
    assert.equal(n, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("credential settings never return stored API passwords", async () => {
  const { env } = fixture();
  const a = await setupPrompt(env);
  const response = await call(
    env,
    { userId: "alice" },
    "/settings",
    "GET",
    undefined,
    a.id,
  );
  const text = await response.text();
  assert.ok(!text.includes("test-provider-password"));
  assert.ok(!text.includes("ciphertext"));
  assert.ok(text.includes("dataforseo_configured"));
});

test("workspace brand sets isolate client research and permit local competitor relationships", async () => {
  const { env } = fixture();
  const a = await setupPrompt(env);
  const b = await call(
    env,
    { userId: "alice" },
    "/brands",
    "POST",
    { name: "Other Agency Client", domain: "other.test", kind: "client" },
    a.id,
  );
  const other = (await b.json()) as any;
  await call(
    env,
    { userId: "alice" },
    "/workspaces/" + a.workspace_id + "/brands",
    "POST",
    { brand_id: a.brandId, kind: "own" },
    a.id,
  );
  let run = await createRun(env, a.id, a.promptId, "workspace-snapshot-1");
  assert.equal(JSON.parse(String(run.config)).brands.length, 1);
  await call(
    env,
    { userId: "alice" },
    "/workspaces/" + a.workspace_id + "/brands",
    "POST",
    { brand_id: other.id, kind: "competitor" },
    a.id,
  );
  run = await createRun(env, a.id, a.promptId, "workspace-snapshot-2");
  const brands = JSON.parse(String(run.config)).brands;
  assert.equal(brands.length, 2);
  assert.equal(brands.find((b: any) => b.id === other.id).kind, "competitor");
  const foreign = await organization(env, "bob");
  await assert.rejects(
    call(
      env,
      { userId: "alice" },
      "/workspaces/" + foreign.workspace_id + "/brands",
      "POST",
      { brand_id: a.brandId, kind: "own" },
      a.id,
    ),
    /Not found/,
  );
});
test("provider admission limits each organization to three active tasks", async () => {
  const { env, sql } = fixture();
  const a = await setupPrompt(env);
  for (let i = 0; i < 3; i++) {
    const r = await createRun(env, a.id, a.promptId, "concurrency-" + i);
    sql
      .prepare("UPDATE runs SET status='submitted',task_id=? WHERE id=?")
      .run("task-" + i, r.id as string);
  }
  const waiting = await createRun(env, a.id, a.promptId, "concurrency-waiting");
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("Should not call provider when full");
  }) as typeof fetch;
  try {
    await executeRun(env, String(waiting.id));
    const status = sql
      .prepare("SELECT status FROM runs WHERE id=?")
      .get(waiting.id as string)?.status;
    assert.equal(status, "queued");
  } finally {
    globalThis.fetch = original;
  }
});

test("customer rate budget is shared across keys, members and MCP while other customers remain isolated", async () => {
  const { env, sql } = fixture();
  const a = await organization(env);
  const b = await organization(env, "bob");
  const makeKey = async () => {
    const r = await call(env, { userId: "alice" }, "/keys", "POST", { name: "Agent", scopes: ["read"] }, a.id);
    const { key } = await r.json() as { key: string };
    return authenticate(new Request(env.BASE_URL, { headers: { Authorization: `Bearer ${key}` } }), env);
  };
  const k1 = await makeKey(), k2 = await makeKey();
  sql.prepare("INSERT INTO memberships VALUES(?,?,'member',?)").run(a.id, "eve", Date.now());
  sql.exec("DELETE FROM request_limits");
  env.API_REQUESTS_PER_MINUTE = "3";
  await call(env, k1, "/workspaces");
  await call(env, k2, "/workspaces");
  await call(env, { userId: "eve" }, "/workspaces", "GET", undefined, a.id);
  // Actual MCP tool invocation must consume the same customer budget.
  const { mcp } = await import("../src/server/mcp");
  const keyResponse = await call(env, { userId: "bob" }, "/keys", "POST", { name: "Bob agent", scopes: ["read"] }, b.id);
  const { key: bobKey } = await keyResponse.json() as { key: string };
  const aliceKey = "trk_" + "test-alice-key";
  const { hashToken } = await import("../src/server/crypto");
  sql.prepare("UPDATE api_keys SET token_hash=? WHERE id=?").run(await hashToken(aliceKey), k1.keyId!);
  const rpc = (key: string) => mcp(new Request(`${env.BASE_URL}/mcp`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_workspaces", arguments: {} } }),
  }), env, ctx);
  const result = await (await rpc(aliceKey)).json() as any;
  assert.equal(result.result.isError, true);
  const error = JSON.parse(result.result.content[0].text);
  assert.equal(error.status, 429);
  assert.ok(error.retry_after_seconds >= 1 && error.retry_after_seconds <= 60);
  assert.equal((await (await rpc(bobKey)).json() as any).result.isError, false);
  await assert.rejects(call(env, k2, "/workspaces"), (e: any) => e.status === 429 && Number(e.headers["Retry-After"]) > 0);
  // Previous minute does not consume the new window's allowance.
  sql.prepare("UPDATE request_limits SET bucket=bucket-1 WHERE key=?").run(`customer:${a.id}`);
  assert.equal((await call(env, k1, "/workspaces")).status, 200);
});

test("provider budget rejects costly operations before dispatch and validates deployment overrides", async () => {
  const { env, sql } = fixture();
  const o = await organization(env);
  env.PROVIDER_REQUESTS_PER_MINUTE = "1";
  // Even missing-resource requests are bounded before resource work.
  await assert.rejects(call(env, { userId: "alice" }, "/prompts/missing/run", "POST", {}, o.id), (e: any) => e.status === 404);
  await assert.rejects(call(env, { userId: "alice" }, "/runs/missing/refresh", "POST", {}, o.id), (e: any) => e.status === 429);
  assert.equal((await call(env, { userId: "alice" }, "/workspaces", "GET", undefined, o.id)).status, 200);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM runs").get()!.n, 0);
  const { requestLimit } = await import("../src/server/rate-limit");
  for (const bad of [undefined, "", "0", "-1", "abc", "1.5", "10001"]) assert.equal(requestLimit(bad, 120), 120);
  assert.equal(requestLimit("45", 120), 45);
});

test("plan versions are immutable; retired customers are grandfathered and defaults affect only new organizations", async () => {
  const { env, sql } = fixture();
  const a = await organization(env);
  assert.equal(sql.prepare("SELECT plan_version_id FROM organization_plans WHERE org_id=?").get(a.id)!.plan_version_id, "beta-v1");
  assert.throws(() => sql.exec("UPDATE plan_versions SET price_cents=2000 WHERE id='beta-v1'"), /new plan version/);
  assert.throws(() => sql.exec("DELETE FROM plan_versions WHERE id='pro-v1'"), /Retire/);
  sql.exec("UPDATE plan_versions SET status='draft' WHERE id='starter-v1'");
  assert.throws(() => sql.prepare("UPDATE organization_plans SET plan_version_id='starter-v1' WHERE org_id=?").run(a.id), /active plan/);
  sql.exec("UPDATE plan_versions SET status='active' WHERE id='starter-v1'");
  env.DEFAULT_PLAN_VERSION = 'starter-v1';
  const b = await organization(env, 'bob');
  sql.exec("UPDATE plan_versions SET status='retired' WHERE id='starter-v1'");
  env.BILLING_ENABLED = "true";
  env.STRIPE_SECRET_KEY = "sk_test_fixture";
  sql.prepare("INSERT INTO billing_customers(org_id,customer_id,status,price_id,updated_at) VALUES(?,'cus_bob','active','price_bob',?)").run(b.id,Date.now());
  sql.exec("INSERT INTO billing_prices VALUES('price_bob','starter-v1',0)");
  const settings = await (await call(env, { userId: 'bob' }, '/settings' , 'GET', undefined, b.id)).json() as any;
  assert.equal(settings.plan.version, 'starter-v1');
  assert.equal(settings.plan.price_cents, 1000);
  assert.equal(settings.plan.limits.runs_per_month, 6000);
  assert.equal(sql.prepare("SELECT plan_version_id FROM organization_plans WHERE org_id=?").get(a.id)!.plan_version_id, 'beta-v1');
  await assert.rejects(organization(env, 'eve'), /Default plan/);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM organizations").get()!.n, 2);
  sql.prepare("UPDATE organization_plans SET plan_version_id='beta-v1',assigned_at=?,reason='Test downgrade' WHERE org_id=?").run(Date.now(),b.id);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM plan_assignment_history WHERE org_id=?").get(b.id)!.n, 2);
});

test("monthly budgets survive key changes and plan changes without resetting usage", async () => {
  const { env, sql } = fixture();
  const a = await organization(env), b = await organization(env, 'bob');
  const limits = JSON.stringify({ api_per_minute: 120, api_per_month: 2, provider_per_minute: 10, runs_per_month: 1, concurrent_runs: 1 });
  sql.prepare("INSERT INTO plan_versions VALUES('tiny-v1','test','Tiny',0,'usd','month','active',?,0)").run(limits);
  sql.prepare("UPDATE organization_plans SET plan_version_id='tiny-v1' WHERE org_id=?").run(a.id);
  await call(env, {userId:'alice'}, '/workspaces', 'GET', undefined, a.id);
  await call(env, {userId:'alice',orgId:a.id,keyId:'different-key',scopes:['read']}, '/workspaces');
  await assert.rejects(call(env,{userId:'alice'},'/workspaces','GET',undefined,a.id),(e:any)=>e.status===429 && /Monthly API/.test(e.message) && Number(e.headers['Retry-After'])>0);
  assert.equal((await call(env,{userId:'bob'},'/workspaces','GET',undefined,b.id)).status,200);
  sql.prepare("UPDATE organization_plans SET plan_version_id='beta-v1' WHERE org_id=?").run(a.id);
  assert.equal((await call(env,{userId:'alice'},'/workspaces','GET',undefined,a.id)).status,200);
  const { calendarMonth } = await import('../src/server/plans');
  assert.equal(sql.prepare("SELECT operations FROM monthly_api_usage WHERE org_id=? AND month=?").get(a.id,calendarMonth().key)!.operations,3);
  sql.prepare("UPDATE organization_plans SET plan_version_id='tiny-v1' WHERE org_id=?").run(a.id);
  await assert.rejects(call(env,{userId:'alice'},'/workspaces','GET',undefined,a.id),/Monthly API/);
  sql.prepare("UPDATE monthly_api_usage SET month='2020-01' WHERE org_id=?").run(a.id);
  assert.equal((await call(env,{userId:'alice'},'/workspaces','GET',undefined,a.id)).status,200);
  assert.equal(calendarMonth(Date.UTC(2026,11,31)).end,Date.UTC(2027,0,1));
});

test("monthly provider admission is atomic, includes scheduled runs and does not count idempotent retries twice", async () => {
  const { env, sql } = fixture();
  const a = await setupPrompt(env);
  const limits = JSON.stringify({api_per_minute:120,api_per_month:200000,provider_per_minute:10,runs_per_month:1,concurrent_runs:1});
  sql.prepare("INSERT INTO plan_versions VALUES('one-v1','test','One run',0,'usd','month','active',?,0)").run(limits);
  sql.prepare("UPDATE organization_plans SET plan_version_id='one-v1' WHERE org_id=?").run(a.id);
  const results = await Promise.allSettled([createRun(env,a.id,a.promptId,'first-monthly-run'),createRun(env,a.id,a.promptId,'schedule:monthly-test')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const winner = (results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>).value;
  assert.equal((await createRun(env,a.id,a.promptId,String(winner.idempotency_key))).id,winner.id);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM runs WHERE org_id=?").get(a.id)!.n,1);
  const original = globalThis.fetch;
  globalThis.fetch = (async()=>Response.json({status_code:20000,tasks:[{id:'external',status_code:20100}]})) as typeof fetch;
  try {
    // Changing allowance does not alter the immutable version; use a new revision.
    sql.prepare("INSERT INTO plan_versions VALUES('two-v1','test','Two runs',0,'usd','month','active',?,0)").run(limits.replace('"runs_per_month":1','"runs_per_month":2'));
    sql.prepare("UPDATE organization_plans SET plan_version_id='two-v1' WHERE org_id=?").run(a.id);
    const second=await createRun(env,a.id,a.promptId,'second-monthly-run');
    await executeRun(env,String(winner.id));
    await executeRun(env,String(second.id));
    assert.equal(sql.prepare("SELECT status FROM runs WHERE id=?").get(String(second.id))!.status,'queued');
  } finally {globalThis.fetch=original;}
});

test("plan migration backfills existing organizations and preserves their daily guardrail", () => {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_initial.sql','0002_workflow_dispatch.sql','0003_workspace_brands.sql'])
    db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  db.prepare('INSERT INTO organizations(id,name,created_at,daily_run_limit) VALUES(?,?,?,?)').run('legacy','Legacy customer',12345,42);
  db.exec(readFileSync(new URL('../migrations/0004_versioned_plans.sql',import.meta.url),'utf8'));
  const assignment=db.prepare('SELECT * FROM organization_plans WHERE org_id=?').get('legacy')!;
  assert.equal(assignment.plan_version_id,'beta-v1');
  assert.equal(assignment.assigned_at,12345);
  assert.equal(db.prepare('SELECT daily_run_ceiling FROM organizations WHERE id=?').get('legacy')!.daily_run_ceiling,42);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM plan_assignment_history WHERE org_id=?').get('legacy')!.n,1);
  db.close();
});

test("customers cannot self-upgrade through Settings and emergency ceilings cannot raise a plan allowance", async () => {
  const {env}=fixture();
  const a=await organization(env);
  await assert.rejects(call(env,{userId:'alice'},'/settings','PATCH',{resolve_poisoned_results:true,daily_run_limit:20,plan_version_id:'pro-v1'},a.id),(e:any)=>e.status===400);
  const {safetyCeiling}=await import('../src/server/rate-limit');
  assert.equal(safetyCeiling('9999',120),120);
  assert.equal(safetyCeiling('60',120),60);
  assert.equal(safetyCeiling(undefined,360),360);
  assert.equal(safetyCeiling('invalid',360),360);
});

test("named invitations require the recipient's verified email, preview without claiming, and preserve separate organizations", async () => {
  const { env, sql }=fixture();
  const a=await organization(env), b=await organization(env,'bob');
  const r=await call(env,{userId:'alice'},'/invites','POST',{email:' BOB@EXAMPLE.TEST ',role:'viewer'},a.id);
  const {url}=await r.json() as any;
  const token=new URLSearchParams(new URL(url).hash.slice(1)).get('invite');
  const preview=await (await call(env,{userId:'bob'},'/invites/preview','POST',{token})).json() as any;
  assert.equal(preview.recipient_email,'bob@example.test');
  assert.equal(preview.signed_in_email,'bob@example.test');
  assert.equal(preview.email_matches,true);
  assert.equal(sql.prepare('SELECT claimed_by FROM invites').get()!.claimed_by,null);
  await assert.rejects(call(env,{userId:'eve'},'/invites/accept','POST',{token}),(e:any)=>e.status===403);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM memberships WHERE org_id=? AND user_id='eve'").get(a.id)!.n,0);
  sql.exec("UPDATE user SET emailVerified=0 WHERE id='bob'");
  await assert.rejects(call(env,{userId:'bob'},'/invites/accept','POST',{token}),/Verify your email/);
  sql.exec("UPDATE user SET emailVerified=1 WHERE id='bob'");
  await call(env,{userId:'bob'},'/invites/accept','POST',{token});
  const orgs=await (await call(env,{userId:'bob'},'/organizations')).json() as any;
  assert.deepEqual(new Set(orgs.organizations.map((o:any)=>o.id)),new Set([a.id,b.id]));
  assert.equal(sql.prepare("SELECT role FROM memberships WHERE org_id=? AND user_id='bob'").get(a.id)!.role,'viewer');
  assert.equal(sql.prepare("SELECT role FROM memberships WHERE org_id=? AND user_id='bob'").get(b.id)!.role,'owner');
  await assert.rejects(call(env,{userId:'bob'},'/invites/accept','POST',{token}),/expired or already used/);
  await assert.rejects(call(env,{userId:'alice'},'/invites','POST',{role:'member'},a.id),(e:any)=>e.status===400);
});

test("invite expiry, revocation, API-key rejection, and existing-role preservation", async () => {
  const { env,sql }=fixture(); const a=await organization(env);
  const invite=async(email:string) => {
    const d=await (await call(env,{userId:'alice'},'/invites','POST',{email,role:'viewer'},a.id)).json() as any;
    return {id:d.id,token:new URLSearchParams(new URL(d.url).hash.slice(1)).get('invite')};
  };
  const own=await invite('alice@example.test');
  await assert.rejects(call(env,{userId:'alice',keyId:'agent'},'/invites/accept','POST',{token:own.token}),(e:any)=>e.status===403);
  await call(env,{userId:'alice'},'/invites/accept','POST',{token:own.token});
  assert.equal(sql.prepare("SELECT role FROM memberships WHERE org_id=? AND user_id='alice'").get(a.id)!.role,'owner');
  const expired=await invite('bob@example.test'); sql.prepare('UPDATE invites SET expires_at=0 WHERE id=?').run(expired.id);
  await assert.rejects(call(env,{userId:'bob'},'/invites/preview','POST',{token:expired.token}),/expired/);
  const revoked=await invite('bob@example.test'); await call(env,{userId:'alice'},`/invites/${revoked.id}`,'DELETE',undefined,a.id);
  await assert.rejects(call(env,{userId:'bob'},'/invites/accept','POST',{token:revoked.token}),/expired/);
});

// Real Better Auth handlers and D1 adapter; only Google's external proof is mocked.
// These tests do not claim to validate Google's signature/JWKS service or live consent UI.
async function googleHarness(env: Env, signup = true) {
  env.GOOGLE_CLIENT_ID='test-client'; env.GOOGLE_CLIENT_SECRET='test-secret'; env.SIGNUP_ENABLED=String(signup);
  const instance=auth(env), context=await instance.$context;
  const provider=(context.socialProviders as any[]).find(p=>p.id==='google');
  let profile={id:'google-alice',email:'alice@example.test',name:'Alice',emailVerified:true};
  provider.options.verifyIdToken=async()=>true;
  provider.getUserInfoFromIdToken=async()=>({user:profile,data:{sub:profile.id,email:profile.email,email_verified:profile.emailVerified}});
  provider.accountSubject=async()=>profile.id;
  return {instance,context, setProfile:(p:typeof profile)=>{profile=p;},
    signIn:async()=>{
      const result=await instance.api.signInSocial({body:{provider:'google',idToken:{token:'test-provider-proof'},callbackURL:env.BASE_URL+'/app'}});
      if (!('user' in result)) throw new Error('Expected token-based login');
      return result;
    }};
}

test("verified password user and Google share one identity; unverified local/provider emails cannot auto-link", async () => {
  const {env,sql}=fixture();const a=await organization(env);
  const h=await googleHarness(env);
  await h.context.internalAdapter.createAccount({userId:'alice',providerId:'credential',accountId:'alice',password:await h.context.password.hash('Existing-password-123')});
  const login=await h.signIn(); assert.equal(login.user.id,'alice');
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM user WHERE email='alice@example.test'").get()!.n,1);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM account WHERE userId='alice'").get()!.n,2);
  await h.instance.api.signUpEmail({body:{email:'alice@example.test',name:'Duplicate password user',password:'Attacker-chosen-password-123'}});
  await assert.rejects(h.instance.api.signInEmail({body:{email:'alice@example.test',password:'Attacker-chosen-password-123'}}));
  assert.equal((await h.instance.api.signInEmail({body:{email:'alice@example.test',password:'Existing-password-123'}})).user.id,'alice');
  assert.equal(sql.prepare("SELECT org_id FROM memberships WHERE user_id='alice'").get()!.org_id,a.id);
  h.setProfile({id:'google-bob',email:'bob@example.test',name:'Bob',emailVerified:true});
  sql.exec("UPDATE user SET emailVerified=0 WHERE id='bob'");
  await assert.rejects(h.signIn(),/account not linked/);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM account WHERE userId='bob'").get()!.n,0);
  sql.exec("UPDATE user SET emailVerified=1 WHERE id='bob'");
  assert.equal((await h.signIn()).user.id,'bob');
  h.setProfile({id:'google-eve',email:'eve@example.test',name:'Eve',emailVerified:false});
  await assert.rejects(h.signIn());
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM account WHERE userId='eve'").get()!.n,0);
  h.setProfile({id:'unverified-new-google',email:'unverified-new@example.test',name:'Unverified',emailVerified:false});
  await assert.rejects(h.signIn());
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM user WHERE email='unverified-new@example.test'").get()!.n,0);
});

test("Google-first duplicate signup cannot install a password; mailbox reset adds credentials to the same identity", async () => {
  const {env,sql}=fixture();const h=await googleHarness(env);
  h.setProfile({id:'google-new',email:'google-only@example.test',name:'New Google user',emailVerified:true});
  const first=await h.signIn();const uid=first.user.id;
  await assert.rejects(h.instance.api.signInEmail({body:{email:'google-only@example.test',password:'Never-created-password-123'}}));
  const dupe=await h.instance.api.signUpEmail({body:{email:'GOOGLE-ONLY@example.test',name:'Duplicate',password:'Unproven-password-123'}});
  assert.equal(dupe.token,null);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM user WHERE email='google-only@example.test'").get()!.n,1);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM account WHERE userId=? AND providerId='credential'").get(uid)!.n,0);
  // Deliver the real request-reset flow to a fake mail transport, never an external inbox.
  const original=globalThis.fetch;let resetUrl='';
  env.RESEND_API_KEY='test-mail-key'; env.EMAIL_FROM='TrackRank <test@example.test>';
  globalThis.fetch=(async(input:unknown,init?:RequestInit)=>{
    assert.equal(String(input),'https://api.resend.com/emails');
    const mail=JSON.parse(String(init?.body)); resetUrl=mail.text.split('\n').find((line:string)=>line.startsWith('https://'));
    return Response.json({id:'fake-mail'});
  }) as typeof fetch;
  try {
    await h.instance.api.requestPasswordReset({body:{email:'google-only@example.test',redirectTo:env.BASE_URL+'/login'}});
    assert.ok(resetUrl.includes('/reset-password/'));
    const resetToken=new URL(resetUrl).pathname.split('/').pop()!;
    assert.ok(Number(sql.prepare('SELECT COUNT(*) AS n FROM session WHERE userId=?').get(uid)!.n)>0);
    await h.instance.api.resetPassword({body:{token:resetToken,newPassword:'Mailbox-owned-password-123'}});
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM session WHERE userId=?').get(uid)!.n,0);
    assert.equal((await h.instance.api.signInEmail({body:{email:'google-only@example.test',password:'Mailbox-owned-password-123'}})).user.id,uid);
    assert.equal((await h.signIn()).user.id,uid);
    await assert.rejects(h.instance.api.resetPassword({body:{token:resetToken,newPassword:'Reuse-token-password-123'}}));
    assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM account WHERE userId=?").get(uid)!.n,2);
  } finally {globalThis.fetch=original;}
});

test("closing signup also blocks new Google users without locking out existing users", async () => {
  const {env,sql}=fixture(); const h=await googleHarness(env,false);
  assert.equal((await h.signIn()).user.id,'alice');
  h.setProfile({id:'new-closed-google',email:'closed-google@example.test',name:'Closed signup',emailVerified:true});
  await assert.rejects(h.signIn());
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM user WHERE email='closed-google@example.test'").get()!.n,0);
});

test("recipient migration expires unclaimed legacy links but retains claimed invitation history", () => {
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO user VALUES(?,?,?,1,NULL,?,?)').run('owner','Owner','owner@example.test',1,1);
  db.prepare('INSERT INTO organizations(id,name,created_at) VALUES(?,?,?)').run('org','Organization',1);
  const insert=db.prepare('INSERT INTO invites(id,org_id,token_hash,role,expires_at,created_by,claimed_by,created_at) VALUES(?,?,?,?,?,?,?,?)');
  insert.run('pending','org','pending-hash','member',9999999999999,'owner',null,1);
  insert.run('claimed','org','claimed-hash','member',9999999999999,'owner','owner',1);
  db.exec(readFileSync(new URL('../migrations/0005_recipient_invitations.sql',import.meta.url),'utf8'));
  assert.equal(db.prepare("SELECT expires_at FROM invites WHERE id='pending'").get()!.expires_at,0);
  const claimed=db.prepare("SELECT * FROM invites WHERE id='claimed'").get()!;
  assert.equal(claimed.claimed_by,'owner');assert.equal(claimed.expires_at,9999999999999);
  db.close();
});
