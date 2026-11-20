import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { api } from "../src/server/api";
import { authenticate } from "../src/server/auth";
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
  all() {
    return { results: this.db.prepare(this.sql).all(...(this.args as any[])) };
  }
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
    { role: "member" },
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
test("idempotent runs reserve at most once and enforce daily caps atomically", async () => {
  const { env, sql } = fixture();
  const a = await setupPrompt(env);
  sql
    .prepare("UPDATE organizations SET daily_run_limit=1 WHERE id=?")
    .run(a.id);
  const r1 = await createRun(env, a.id, a.promptId, "same-key-123"),
    r2 = await createRun(env, a.id, a.promptId, "same-key-123");
  assert.equal(r1.id, r2.id);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM runs").get()?.n, 1);
  await assert.rejects(
    createRun(env, a.id, a.promptId, "other-key-123"),
    /Daily run limit/,
  );
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
