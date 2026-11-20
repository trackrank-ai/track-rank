import { z } from "zod";
import { admin, authenticate, organizations, tenant } from "./auth";
import { hashToken, seal, token } from "./crypto";
import { analyzeRun, collectRun, createRun, credentials } from "./provider";
import {
  all,
  exec,
  HttpError,
  json,
  now,
  one,
  required,
  uuid,
  type Ctx,
  type Env,
  type Principal,
  type Row,
} from "./types";
import { launchRun } from "./dispatch";
const name = z.string().trim().min(1).max(100);
const id = z.string().min(1).max(100);
const domain = z
  .string()
  .trim()
  .max(253)
  .refine(
    (s) => !s || /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(s),
    "Use a domain such as example.com, not a URL",
  );
const promptSchema = z
  .object({
    workspace_id: id,
    brand_id: id.nullable().optional(),
    text: z.string().trim().min(3).max(700),
    engine: z.enum(["chatgpt", "gemini", "google"]).default("chatgpt"),
    mode: z.enum(["standard", "priority", "live"]).default("standard"),
    location_name: z.string().trim().min(2).max(200).default("United States"),
    language_code: z
      .string()
      .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
      .default("en"),
    enabled: z.boolean().default(true),
  })
  .strict();
async function body<T>(req: Request, s: z.ZodType<T>): Promise<T> {
  if (Number(req.headers.get("content-length") || 0) > 32768)
    throw new HttpError(413, "Request too large");
  const text = await req.text();
  if (text.length > 32768) throw new HttpError(413, "Request too large");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HttpError(400, "JSON body required");
  }
  const parsed = s.safeParse(value);
  if (!parsed.success)
    throw new HttpError(
      400,
      parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")
        .slice(0, 500),
    );
  return parsed.data;
}
async function belongs(
  env: Env,
  table: "brands" | "workspaces" | "prompts",
  orgId: string,
  resourceId: unknown,
) {
  if (resourceId)
    required(
      await one(
        env,
        `SELECT id FROM ${table} WHERE org_id=? AND id=?`,
        orgId,
        resourceId,
      ),
    );
}
async function audit(
  env: Env,
  p: Principal,
  action: string,
  resourceId: string,
) {
  await exec(
    env,
    "INSERT INTO audit_log VALUES(?,?,?,?,?,?)",
    uuid(),
    p.orgId,
    p.userId,
    action,
    resourceId,
    now(),
  );
}
export async function api(
  req: Request,
  env: Env,
  ctx: Ctx,
  principal?: Principal,
): Promise<Response> {
  const u = new URL(req.url),
    path = u.pathname.replace(/^\/api\/v1/, "").replace(/\/$/, ""),
    method = req.method;
  const p = principal || (await authenticate(req, env));
  const count = await one<{ count: number }>(
    env,
    "INSERT INTO request_limits(key,bucket,count) VALUES(?,?,1) ON CONFLICT(key,bucket) DO UPDATE SET count=count+1 RETURNING count",
    p.keyId || p.userId,
    Math.floor(now() / 60000),
  );
  if ((count?.count || 0) > 120)
    throw new HttpError(429, "Too many requests; try again in one minute");
  if (path === "/organizations" && method === "GET")
    return json({ organizations: await organizations(env, p) });
  if (path === "/organizations" && method === "POST") {
    if (p.keyId) throw new HttpError(403, "Sign in to create organizations");
    const b = await body(req, z.object({ name }).strict()),
      orgId = uuid(),
      workspaceId = uuid(),
      t = now();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO organizations(id,name,created_at) VALUES(?,?,?)",
      ).bind(orgId, b.name, t),
      env.DB.prepare("INSERT INTO memberships VALUES(?,?,'owner',?)").bind(
        orgId,
        p.userId,
        t,
      ),
      env.DB.prepare(
        "INSERT INTO workspaces(id,org_id,name,created_at) VALUES(?,?,'Default workspace',?)",
      ).bind(workspaceId, orgId, t),
    ]);
    return json({ id: orgId, workspace_id: workspaceId }, 201);
  }
  if (path === "/invites/accept" && method === "POST") {
    if (p.keyId) throw new HttpError(403, "Sign in to accept invitations");
    const b = await body(
      req,
      z.object({ token: z.string().min(30).max(128) }).strict(),
    );
    const h = await hashToken(b.token),
      i = required(
        await one<Row>(
          env,
          "SELECT * FROM invites WHERE token_hash=? AND claimed_by IS NULL AND expires_at>?",
          h,
          now(),
        ),
        "Invitation expired or already used",
      );
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO memberships(org_id,user_id,role,created_at) SELECT org_id,?,role,? FROM invites WHERE id=? AND claimed_by IS NULL AND expires_at>?",
      ).bind(p.userId, now(), i.id, now()),
      env.DB.prepare(
        "UPDATE invites SET claimed_by=? WHERE id=? AND claimed_by IS NULL",
      ).bind(p.userId, i.id),
    ]);
    const claimed = required(
      await one<Row>(env, "SELECT claimed_by FROM invites WHERE id=?", i.id),
    );
    if (claimed.claimed_by !== p.userId)
      throw new HttpError(409, "Invitation already claimed");
    return json({ org_id: i.org_id });
  }
  const scope =
    method === "GET"
      ? "read"
      : path.includes("/run") || path.includes("/analyze")
        ? "run"
        : "write";
  const t = await tenant(env, p, u.searchParams.get("org"), scope),
    org = t.orgId;
  if (path === "/workspaces" && method === "GET")
    return json({
      workspaces: await all(
        env,
        "SELECT w.*, (SELECT json_group_array(brand_id) FROM workspace_brands wb WHERE wb.org_id=w.org_id AND wb.workspace_id=w.id) AS brand_ids FROM workspaces w WHERE org_id=? ORDER BY created_at LIMIT 500",
        org,
      ),
    });
  if (path === "/workspaces" && method === "POST") {
    const b = await body(
      req,
      z.object({ name, brand_id: id.nullable().optional() }).strict(),
    );
    await belongs(env, "brands", org, b.brand_id);
    const wid = uuid();
    await exec(
      env,
      "INSERT INTO workspaces(id,org_id,name,brand_id,created_at) VALUES(?,?,?,?,?)",
      wid,
      org,
      b.name,
      b.brand_id || null,
      now(),
    );
    if (b.brand_id)
      await exec(
        env,
        "INSERT INTO workspace_brands(org_id,workspace_id,brand_id,kind) SELECT org_id,?,id,kind FROM brands WHERE org_id=? AND id=?",
        wid,
        org,
        b.brand_id,
      );
    return json({ id: wid }, 201);
  }
  const workspaceBrand = path.match(
    /^\/workspaces\/([^/]+)\/brands(?:\/([^/]+))?$/,
  );
  if (workspaceBrand && method === "POST") {
    const b = await body(
      req,
      z
        .object({ brand_id: id, kind: z.enum(["own", "client", "competitor"]) })
        .strict(),
    );
    await belongs(env, "workspaces", org, workspaceBrand[1]);
    await belongs(env, "brands", org, b.brand_id);
    await exec(
      env,
      "INSERT INTO workspace_brands(org_id,workspace_id,brand_id,kind) VALUES(?,?,?,?) ON CONFLICT(workspace_id,brand_id) DO UPDATE SET kind=excluded.kind",
      org,
      workspaceBrand[1],
      b.brand_id,
      b.kind,
    );
    return json({ ok: true });
  }
  if (workspaceBrand?.[2] && method === "DELETE") {
    await belongs(env, "workspaces", org, workspaceBrand[1]);
    await exec(
      env,
      "DELETE FROM workspace_brands WHERE org_id=? AND workspace_id=? AND brand_id=?",
      org,
      workspaceBrand[1],
      workspaceBrand[2],
    );
    return json({ ok: true });
  }
  if (path === "/brands" && method === "GET")
    return json({
      brands: await all(
        env,
        "SELECT * FROM brands WHERE org_id=? ORDER BY created_at LIMIT 500",
        org,
      ),
    });
  if (path === "/brands" && method === "POST") {
    const b = await body(
      req,
      z
        .object({
          name,
          domain: domain.default(""),
          aliases: z
            .array(z.string().trim().min(2).max(100))
            .max(20)
            .default([]),
          kind: z.enum(["own", "client", "competitor"]).default("own"),
        })
        .strict(),
    );
    const bid = uuid();
    await exec(
      env,
      "INSERT INTO brands VALUES(?,?,?,?,?,?,?)",
      bid,
      org,
      b.name,
      b.domain.toLowerCase().replace(/^www\./, ""),
      JSON.stringify(b.aliases),
      b.kind,
      now(),
    );
    return json({ id: bid }, 201);
  }
  if (path.startsWith("/brands/") && method === "PATCH") {
    const bid = path.split("/")[2];
    await belongs(env, "brands", org, bid);
    const b = await body(
      req,
      z
        .object({
          name,
          domain: domain.default(""),
          aliases: z
            .array(z.string().trim().min(2).max(100))
            .max(20)
            .default([]),
          kind: z.enum(["own", "client", "competitor"]),
        })
        .strict(),
    );
    await exec(
      env,
      "UPDATE brands SET name=?,domain=?,aliases=?,kind=? WHERE id=? AND org_id=?",
      b.name,
      b.domain.toLowerCase().replace(/^www\./, ""),
      JSON.stringify(b.aliases),
      b.kind,
      bid,
      org,
    );
    return json({ ok: true });
  }
  if (path === "/prompts" && method === "GET") {
    const w = u.searchParams.get("workspace");
    if (w) await belongs(env, "workspaces", org, w);
    return json({
      prompts: await all(
        env,
        "SELECT * FROM prompts WHERE org_id=?" +
          (w ? " AND workspace_id=?" : "") +
          " ORDER BY created_at DESC LIMIT 500",
        org,
        ...(w ? [w] : []),
      ),
    });
  }
  if (path === "/prompts" && method === "POST") {
    const b = await body(req, promptSchema);
    await belongs(env, "workspaces", org, b.workspace_id);
    await belongs(env, "brands", org, b.brand_id);
    const pid = uuid(),
      time = now();
    await exec(
      env,
      "INSERT INTO prompts(id,org_id,workspace_id,brand_id,text,engine,mode,location_name,language_code,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      pid,
      org,
      b.workspace_id,
      b.brand_id || null,
      b.text,
      b.engine,
      b.mode,
      b.location_name,
      b.language_code,
      b.enabled ? 1 : 0,
      time,
      time,
    );
    return json({ id: pid }, 201);
  }
  const match = path.match(/^\/prompts\/([^/]+)(?:\/(run))?$/);
  if (match && method === "PATCH") {
    const b = await body(req, promptSchema);
    await belongs(env, "prompts", org, match[1]);
    await belongs(env, "workspaces", org, b.workspace_id);
    await belongs(env, "brands", org, b.brand_id);
    await exec(
      env,
      "UPDATE prompts SET workspace_id=?,brand_id=?,text=?,engine=?,mode=?,location_name=?,language_code=?,enabled=?,updated_at=? WHERE id=? AND org_id=?",
      b.workspace_id,
      b.brand_id || null,
      b.text,
      b.engine,
      b.mode,
      b.location_name,
      b.language_code,
      b.enabled ? 1 : 0,
      now(),
      match[1],
      org,
    );
    return json({ ok: true });
  }
  if (match?.[2] === "run" && method === "POST") {
    const ik = req.headers.get("Idempotency-Key");
    if (ik && (ik.length > 128 || ik.length < 8))
      throw new HttpError(400, "Idempotency-Key must have 8–128 characters");
    const run = await createRun(env, org, match[1], ik || uuid());
    ctx.waitUntil(launchRun(env, String(run.id)));
    return json({ run: decodeRun(run) }, 202);
  }
  if (path === "/prompt-ideas" && method === "POST") {
    const b = await body(
      req,
      z
        .object({
          topic: z.string().trim().min(2).max(150),
          location: z.string().trim().max(100).default(""),
        })
        .strict(),
    );
    const loc = b.location ? ` in ${b.location}` : "";
    return json({
      method: "deterministic_templates",
      prompts: [
        `What are the best ${b.topic}${loc}?`,
        `How do I choose a ${b.topic}${loc}?`,
        `Which ${b.topic}${loc} offer the best value?`,
        `What should I compare before choosing ${b.topic}${loc}?`,
        `What are common problems with ${b.topic}${loc}?`,
      ],
    });
  }
  if (path === "/runs" && method === "GET") {
    const w = u.searchParams.get("workspace"),
      before = Number(u.searchParams.get("before") || now() + 1);
    if (w) await belongs(env, "workspaces", org, w);
    const runs = await all(
      env,
      "SELECT id,prompt_id,workspace_id,prompt_text,config,status,mentions,citations,grounding_queries,has_answer,error,provider_cost,created_at,updated_at FROM runs WHERE org_id=? AND created_at<?" +
        (w ? " AND workspace_id=?" : "") +
        " ORDER BY created_at DESC LIMIT 100",
      org,
      before,
      ...(w ? [w] : []),
    );
    return json({
      runs: runs.map(decodeRun),
      next_before: runs.length === 100 ? runs[99].created_at : null,
    });
  }
  const runMatch = path.match(/^\/runs\/([^/]+)(?:\/(raw|refresh|analyze))?$/);
  if (runMatch) {
    const r = required(
      await one<Row>(
        env,
        "SELECT * FROM runs WHERE org_id=? AND id=?",
        org,
        runMatch[1],
      ),
    );
    if (!runMatch[2] && method === "GET") return json({ run: decodeRun(r) });
    if (runMatch[2] === "raw" && method === "GET") {
      const o = required(await env.ANSWERS.get(String(r.raw_key || "missing")));
      return new Response(await o.text(), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="${r.id}.json"`,
        },
      });
    }
    if (runMatch[2] === "refresh" && method === "POST") {
      await collectRun(env, r);
      return json({
        run: decodeRun(
          required(
            await one<Row>(
              env,
              "SELECT * FROM runs WHERE org_id=? AND id=?",
              org,
              r.id,
            ),
          ),
        ),
      });
    }
    if (runMatch[2] === "analyze" && method === "POST") {
      if (p.keyId)
        throw new HttpError(
          403,
          "Analysis requires an interactive member session",
        );
      return json(await analyzeRun(env, org, String(r.id)));
    }
  }
  if (path === "/schedules" && method === "GET")
    return json({
      schedules: await all(
        env,
        "SELECT * FROM schedules WHERE org_id=? ORDER BY created_at DESC LIMIT 500",
        org,
      ),
    });
  if (path === "/schedules" && method === "POST") {
    const b = await body(
      req,
      z
        .object({
          prompt_id: id,
          preset: z.enum(["daily", "weekly", "mwf", "custom"]),
          days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
          local_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          timezone: z.string().min(1).max(100),
          enabled: z.boolean().default(false),
        })
        .strict(),
    );
    await belongs(env, "prompts", org, b.prompt_id);
    try {
      new Intl.DateTimeFormat("en", { timeZone: b.timezone }).format();
    } catch {
      throw new HttpError(400, "Invalid IANA timezone");
    }
    const days =
      b.preset === "daily"
        ? [0, 1, 2, 3, 4, 5, 6]
        : b.preset === "mwf"
          ? [1, 3, 5]
          : b.preset === "weekly"
            ? [b.days[0]]
            : b.days;
    const sid = uuid();
    await exec(
      env,
      "INSERT INTO schedules(id,org_id,prompt_id,preset,days,local_time,timezone,enabled,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      sid,
      org,
      b.prompt_id,
      b.preset,
      JSON.stringify(days),
      b.local_time,
      b.timezone,
      b.enabled ? 1 : 0,
      now(),
    );
    return json({ id: sid }, 201);
  }
  if (path.startsWith("/schedules/") && method === "PATCH") {
    const b = await body(
      req,
      z
        .object({
          enabled: z.boolean().optional(),
          local_time: z
            .string()
            .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
            .optional(),
          timezone: z.string().min(1).max(100).optional(),
        })
        .strict(),
    );
    const sid = path.split("/")[2];
    const s = required(
      await one<Row>(
        env,
        "SELECT * FROM schedules WHERE org_id=? AND id=?",
        org,
        sid,
      ),
    );
    if (b.timezone) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: b.timezone }).format();
      } catch {
        throw new HttpError(400, "Invalid IANA timezone");
      }
    }
    await exec(
      env,
      "UPDATE schedules SET enabled=?,local_time=?,timezone=? WHERE org_id=? AND id=?",
      b.enabled === undefined ? s.enabled : b.enabled ? 1 : 0,
      b.local_time || s.local_time,
      b.timezone || s.timezone,
      org,
      sid,
    );
    return json({ ok: true });
  }
  if (path.startsWith("/schedules/") && method === "DELETE") {
    await exec(
      env,
      "DELETE FROM schedules WHERE org_id=? AND id=?",
      org,
      path.split("/")[2],
    );
    return json({ ok: true });
  }
  if (path === "/settings" && method === "GET") {
    const o = required(
      await one<Row>(env, "SELECT * FROM organizations WHERE id=?", org),
    );
    let configured = {
      dataforseo_configured: false,
      openrouter_configured: false,
      openrouter_model: "",
    };
    if (!p.keyId) {
      const c = await credentials(env, org);
      configured = {
        dataforseo_configured: !!(c.login && c.password),
        openrouter_configured: !!c.openrouter_key,
        openrouter_model: c.openrouter_model || "",
      };
    }
    const usage = await one<Row>(
      env,
      "SELECT COUNT(*) AS runs,COALESCE(SUM(provider_cost),0) AS reported_provider_cost FROM runs WHERE org_id=? AND created_at>=?",
      org,
      new Date(new Date().toISOString().slice(0, 10)).getTime(),
    );
    return json({ ...o, ...configured, usage, role: t.role });
  }
  if (path === "/settings" && method === "PATCH") {
    admin(t);
    const b = await body(
      req,
      z
        .object({
          resolve_poisoned_results: z.boolean(),
          daily_run_limit: z.number().int().min(1).max(100),
        })
        .strict(),
    );
    await exec(
      env,
      "UPDATE organizations SET resolve_poisoned_results=?,daily_run_limit=? WHERE id=?",
      b.resolve_poisoned_results ? 1 : 0,
      b.daily_run_limit,
      org,
    );
    await audit(env, t, "settings.updated", org);
    return json({ ok: true });
  }
  if (path === "/credentials" && method === "PUT") {
    admin(t);
    const b = await body(
      req,
      z
        .object({
          login: z.string().trim().min(1).max(200).optional(),
          password: z.string().min(1).max(500).optional(),
          openrouter_key: z.string().min(1).max(500).optional(),
          openrouter_model: z.string().trim().min(1).max(150).optional(),
        })
        .strict(),
    );
    const c = { ...(await credentials(env, org)), ...b };
    if ((c.login && !c.password) || (!c.login && c.password))
      throw new HttpError(
        400,
        "Both DataForSEO login and API password are required",
      );
    await exec(
      env,
      "INSERT INTO credentials(org_id,ciphertext,updated_at) VALUES(?,?,?) ON CONFLICT(org_id) DO UPDATE SET ciphertext=excluded.ciphertext,updated_at=excluded.updated_at",
      org,
      await seal(env, org, c),
      now(),
    );
    await audit(env, t, "credentials.updated", org);
    return json({ ok: true });
  }
  if (path === "/credentials" && method === "DELETE") {
    admin(t);
    await exec(env, "DELETE FROM credentials WHERE org_id=?", org);
    await exec(env, "UPDATE schedules SET enabled=0 WHERE org_id=?", org);
    await audit(env, t, "credentials.removed", org);
    return json({ ok: true });
  }
  if (path === "/keys" && method === "GET") {
    admin(t);
    return json({
      keys: await all(
        env,
        "SELECT id,name,prefix,scopes,expires_at,revoked_at,last_used_at,created_at FROM api_keys WHERE org_id=? ORDER BY created_at DESC",
        org,
      ),
    });
  }
  if (path === "/keys" && method === "POST") {
    admin(t);
    const b = await body(
      req,
      z
        .object({
          name,
          scopes: z
            .array(z.enum(["read", "write", "run"]))
            .min(1)
            .max(3),
          expires_in_days: z.number().int().min(1).max(365).default(90),
        })
        .strict(),
    );
    const raw = "trk_" + token(),
      kid = uuid();
    await exec(
      env,
      "INSERT INTO api_keys(id,org_id,user_id,name,prefix,token_hash,scopes,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      kid,
      org,
      p.userId,
      b.name,
      raw.slice(0, 12),
      await hashToken(raw),
      JSON.stringify([...new Set(b.scopes)]),
      now() + b.expires_in_days * 86400000,
      now(),
    );
    await audit(env, t, "api_key.created", kid);
    return json({ id: kid, key: raw }, 201);
  }
  if (path.startsWith("/keys/") && method === "DELETE") {
    admin(t);
    await exec(
      env,
      "UPDATE api_keys SET revoked_at=? WHERE org_id=? AND id=?",
      now(),
      org,
      path.split("/")[2],
    );
    await audit(env, t, "api_key.revoked", path.split("/")[2]);
    return json({ ok: true });
  }
  if (path === "/members" && method === "GET") {
    if (p.keyId) throw new HttpError(403, "Interactive session required");
    return json({
      members: await all(
        env,
        "SELECT m.user_id,m.role,u.name,u.email,u.emailVerified FROM memberships m JOIN user u ON u.id=m.user_id WHERE m.org_id=?",
        org,
      ),
    });
  }
  if (path.startsWith("/members/") && ["PATCH", "DELETE"].includes(method)) {
    admin(t);
    const memberId = path.split("/")[2],
      m = required(
        await one<Row>(
          env,
          "SELECT * FROM memberships WHERE org_id=? AND user_id=?",
          org,
          memberId,
        ),
      );
    if (m.role === "owner" || memberId === p.userId)
      throw new HttpError(
        409,
        "Cannot change the owner or your own membership",
      );
    if (t.role !== "owner" && m.role === "admin")
      throw new HttpError(403, "Only an owner can manage administrators");
    if (method === "DELETE")
      await exec(
        env,
        "DELETE FROM memberships WHERE org_id=? AND user_id=?",
        org,
        memberId,
      );
    else {
      const b = await body(
        req,
        z.object({ role: z.enum(["admin", "member", "viewer"]) }).strict(),
      );
      if (b.role === "admin" && t.role !== "owner")
        throw new HttpError(403, "Only owners can appoint admins");
      await exec(
        env,
        "UPDATE memberships SET role=? WHERE org_id=? AND user_id=?",
        b.role,
        org,
        memberId,
      );
    }
    await audit(env, t, "member.updated", memberId);
    return json({ ok: true });
  }
  if (path === "/invites" && method === "GET") {
    admin(t);
    return json({
      invites: await all(
        env,
        "SELECT id,role,expires_at,claimed_by,created_at FROM invites WHERE org_id=? ORDER BY created_at DESC LIMIT 100",
        org,
      ),
    });
  }
  if (path === "/invites" && method === "POST") {
    admin(t);
    const b = await body(
      req,
      z
        .object({
          role: z.enum(["admin", "member", "viewer"]).default("member"),
        })
        .strict(),
    );
    if (b.role === "admin" && t.role !== "owner")
      throw new HttpError(403, "Only owners can invite admins");
    const raw = token(),
      iid = uuid();
    await exec(
      env,
      "INSERT INTO invites(id,org_id,token_hash,role,expires_at,created_by,created_at) VALUES(?,?,?,?,?,?,?)",
      iid,
      org,
      await hashToken(raw),
      b.role,
      now() + 7 * 86400000,
      p.userId,
      now(),
    );
    await audit(env, t, "invite.created", iid);
    return json({ id: iid, url: `${env.BASE_URL}/app#invite=${raw}` }, 201);
  }
  if (path.startsWith("/invites/") && method === "DELETE") {
    admin(t);
    await exec(
      env,
      "DELETE FROM invites WHERE org_id=? AND id=?",
      org,
      path.split("/")[2],
    );
    return json({ ok: true });
  }
  if (path === "/audit" && method === "GET") {
    admin(t);
    return json({
      events: await all(
        env,
        "SELECT * FROM audit_log WHERE org_id=? ORDER BY created_at DESC LIMIT 100",
        org,
      ),
    });
  }
  if (path === "/export" && method === "GET") {
    const rows = await all<Row>(
      env,
      "SELECT id,prompt_text,status,config,mentions,citations,grounding_queries,provider_cost,created_at FROM runs WHERE org_id=? ORDER BY created_at DESC LIMIT 1000",
      org,
    );
    const headers = [
      "id",
      "prompt_text",
      "status",
      "config",
      "mentions",
      "citations",
      "grounding_queries",
      "provider_cost",
      "created_at",
    ];
    const cell = (v: unknown) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replaceAll('"', '""') + '"';
    };
    return new Response(
      [
        headers.join(","),
        ...rows.map((r) => headers.map((h) => cell(r[h])).join(",")),
      ].join("\r\n"),
      {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="trackrank-runs.csv"',
          "Cache-Control": "no-store",
        },
      },
    );
  }
  throw new HttpError(404, "API route not found");
}
export function decodeRun(run: Row) {
  const r = { ...run };
  for (const key of [
    "config",
    "mentions",
    "citations",
    "grounding_queries",
    "organic_results",
    "discovered_brands",
  ])
    if (typeof r[key] === "string") {
      try {
        r[key] = JSON.parse(r[key] as string);
      } catch {
        r[key] = null;
      }
    }
  delete r.org_id;
  delete r.raw_key;
  return r;
}
