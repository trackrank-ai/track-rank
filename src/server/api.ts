import { bulkRunSchema, bulkScheduleSchema, bulkToggleSchema, updateBulkSchedules, bulkScheduleUpdateSchema, selectedRows, createBulkRuns, createBulkSchedules } from "./bulk";
import { assertProviderOptions, providerOptions } from "./provider-options";
import { MAX_PROMPT_BATCH_BYTES, promptBatchSchema, savePromptBatch } from "./prompt-batch";
import { listSavedPrompts } from "./prompt-library";
import { historyWhere } from "./run-history";
import { requireWorkspaceBrand } from "./workspace-brands";
import { archivePrompts, archiveWorkspace, deleteBrand } from "./resource-archive";
import { startTrial } from "./trials";
import { billingRoute } from "./billing";
import { localAuthEnabled } from "./local-auth";
import { defaultPlanVersion, organizationPlan } from "./plans";
import { runUsage, runUsagePeriods } from "./run-admission";
import { customerLimit, enforceLimit } from "./rate-limit";
import { z } from "zod";
import { admin, authenticate, organizations, tenant } from "./auth";
import { hashToken, token } from "./crypto";
import { analyzeRun, collectRun, createRun } from "./provider";
import { credentials, credentialStatus, removeAllCredentials, updateCredentials } from "./provider-credentials";
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
      .min(2).max(20)
      .default("en"),
    enabled: z.boolean().default(true),
  })
  .strict();
async function body<T>(req: Request, s: z.ZodType<T>, limit = 32_768): Promise<T> {
  if (Number(req.headers.get("content-length") || 0) > limit)
    throw new HttpError(413, "Request too large");
  const reader = req.body?.getReader();
  const decoder = new TextDecoder();
  let text = "", bytes = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel().catch(() => {});
        throw new HttpError(413, "Request too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }
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
  includeArchived = false,
) {
  if (resourceId)
    required(
      await one(
        env,
        `SELECT id FROM ${table} WHERE org_id=? AND id=?${table !== "brands" && !includeArchived ? " AND archived_at IS NULL" : ""}`,
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
  // Only account-level routes precede tenant resolution. Keys use their customer budget.
  if (["/organizations", "/onboarding/trial", "/invites/accept", "/invites/preview"].includes(path)) {
    if (p.orgId) await customerLimit(env, p.orgId);
    else await enforceLimit(env, `account:${p.userId}`, 120);
  }
  if (path === "/onboarding/trial" && method === "POST") {
    if (p.keyId) throw new HttpError(403, "Sign in to start a trial");
    if (env.HOSTED_FREE_TRIAL_ENABLED !== "true") throw new HttpError(503, "Free trial enrollment is temporarily unavailable");
    const user = await one<Row>(env, "SELECT name,emailVerified FROM user WHERE id=?", p.userId);
    if (!user?.emailVerified) throw new HttpError(403, "Verify your email before starting the trial");
    const claim = await one<Row>(env, "SELECT org_id FROM account_trial_claims WHERE user_id=?", p.userId);
    if (claim) {
      if (!claim.org_id || !await one(env, "SELECT org_id FROM memberships WHERE org_id=? AND user_id=?", claim.org_id, p.userId)) throw new HttpError(409, "Your introductory trial has already been used");
      return json({ id: claim.org_id });
    }
    const orgId = "trial_" + await hashToken(p.userId), workspaceId = orgId + "_default", t = now();
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO organizations(id,name,created_at) VALUES(?,?,?)").bind(orgId, (String(user.name || "My") + "'s organization").slice(0,100),t),
      env.DB.prepare("INSERT OR IGNORE INTO organization_plans VALUES(?,'pending-v1',?,'Trial onboarding')").bind(orgId,t),
      env.DB.prepare("INSERT OR IGNORE INTO memberships VALUES(?,?,'owner',?)").bind(orgId,p.userId,t),
      env.DB.prepare("INSERT OR IGNORE INTO workspaces(id,org_id,name,created_at) VALUES(?,?,'Default workspace',?)").bind(workspaceId,orgId,t),
    ]);
    await startTrial(env,p.userId,orgId);
    return json({ id: orgId },201);
  }
  if (path === "/organizations" && method === "GET")
    return json({ organizations: await organizations(env, p) });
  if (path === "/organizations" && method === "POST") {
    if (p.keyId) throw new HttpError(403, "Sign in to create organizations");
    const b = await body(req, z.object({ name }).strict()),
      orgId = uuid(),
      workspaceId = uuid(),
      t = now();
    const planVersion = await defaultPlanVersion(env);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO organizations(id,name,created_at) VALUES(?,?,?)",
      ).bind(orgId, b.name, t),
      env.DB.prepare("INSERT INTO organization_plans(org_id,plan_version_id,assigned_at,reason) VALUES(?,?,?,?)").bind(orgId, planVersion, t, "New organization default"),
      env.DB.prepare("INSERT INTO memberships VALUES(?,?,'owner',?)").bind(
        orgId,
        p.userId,
        t,
      ),
      env.DB.prepare(
        "INSERT INTO workspaces(id,org_id,name,created_at) VALUES(?,?,'Default workspace',?)",
      ).bind(workspaceId, orgId, t),
    ]);
    // Creating another organization must never restart the account's introductory trial.
    if (env.HOSTED_FREE_TRIAL_ENABLED === "true" && planVersion === "pending-v1") {
      const claim = await one(env, "SELECT user_id FROM account_trial_claims WHERE user_id=?", p.userId);
      if (!claim) await startTrial(env, p.userId, orgId);
    }
    return json({ id: orgId, workspace_id: workspaceId }, 201);
  }
  if (["/invites/accept", "/invites/preview"].includes(path) && method === "POST") {
    if (p.keyId) throw new HttpError(403, "Sign in to review or accept invitations");
    const b = await body(req, z.object({ token: z.string().min(30).max(128) }).strict());
    const i = required(await one<Row>(env,
      "SELECT i.*,o.name AS organization_name FROM invites i JOIN organizations o ON o.id=i.org_id WHERE i.token_hash=? AND i.claimed_by IS NULL AND i.expires_at>? AND i.recipient_email IS NOT NULL",
      await hashToken(b.token), now()), "Invitation expired or already used");
    const user = required(await one<Row>(env,"SELECT email,emailVerified FROM user WHERE id=?",p.userId));
    const matches = String(user.email).toLowerCase() === i.recipient_email;
    const verified = !!user.emailVerified || localAuthEnabled(env);
    if (path === "/invites/preview") {
      const member = await one<Row>(env,"SELECT role FROM memberships WHERE org_id=? AND user_id=?",i.org_id,p.userId);
      return json({ organization_name: i.organization_name, recipient_email: i.recipient_email,
        signed_in_email: user.email, email_matches: matches, email_verified: verified,
        role: member?.role || i.role, already_member: !!member, expires_at: i.expires_at });
    }
    if (!matches) throw new HttpError(403, "Sign in with the email address this invitation was sent to");
    if (!verified) throw new HttpError(403, "Verify your email before accepting this invitation");
    const time = now(), bypass = localAuthEnabled(env) ? 1 : 0;
    // Both statements recheck recipient, proof, expiry and claim inside one D1 transaction.
    const guard = "id=? AND claimed_by IS NULL AND expires_at>? AND recipient_email=(SELECT lower(email) FROM user WHERE id=? AND (emailVerified=1 OR ?=1))";
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO memberships(org_id,user_id,role,created_at) SELECT org_id,?,role,? FROM invites WHERE ${guard}`)
        .bind(p.userId,time,i.id,time,p.userId,bypass),
      env.DB.prepare(`UPDATE invites SET claimed_by=? WHERE ${guard}`)
        .bind(p.userId,i.id,time,p.userId,bypass),
    ]);
    const claimed = await one<Row>(env,"SELECT claimed_by FROM invites WHERE id=?",i.id);
    if (claimed?.claimed_by !== p.userId) throw new HttpError(409,"Invitation changed or was already claimed");
    await audit(env, {...p,orgId:String(i.org_id)},"invite.accepted",String(i.id));
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
  if (path === "/billing" || path.startsWith("/billing/")) return billingRoute(req, env, t, path);
  await customerLimit(env, org, method === "POST" && (/\/(run|refresh|analyze)$/.test(path) || path === "/runs/bulk"));
  if (path === "/provider/options" && method === "GET") return json(await providerOptions((u.searchParams.get("engines") || "chatgpt").split(",") as ("chatgpt"|"gemini"|"google")[], (u.searchParams.get("q") || "").slice(0,100), (u.searchParams.get("selected_location") || "United States").slice(0,200)));
  if (path === "/workspaces" && method === "GET")
    return json({
      workspaces: await all(
        env,
        "SELECT w.*, (SELECT json_group_array(brand_id) FROM workspace_brands wb WHERE wb.org_id=w.org_id AND wb.workspace_id=w.id) AS brand_ids FROM workspaces w WHERE org_id=?" +
          (u.searchParams.get("include_archived") === "1" ? "" : " AND archived_at IS NULL") + " ORDER BY archived_at,created_at LIMIT 500",
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
    const workspace = env.DB.prepare("INSERT INTO workspaces(id,org_id,name,brand_id,created_at) VALUES(?,?,?,?,?)").bind(
      wid,
      org,
      b.name,
      b.brand_id || null,
      now(),
    );
    if (b.brand_id) {
      await env.DB.batch([workspace, env.DB.prepare(
        "INSERT INTO workspace_brands(org_id,workspace_id,brand_id,kind) SELECT org_id,?,id,kind FROM brands WHERE org_id=? AND id=?",
      ).bind(wid, org, b.brand_id)]);
    } else await workspace.run();
    return json({ id: wid }, 201);
  }
  const workspaceBrand = path.match(
    /^\/workspaces\/([^/]+)\/brands(?:\/([^/]+))?$/,
  );
  const workspaceItem = path.match(/^\/workspaces\/([^/]+)$/);
  if (workspaceItem && method === "PATCH") {
    const wid = workspaceItem[1];
    const b = await body(req, z.object({ name, brand_id: id.nullable().optional() }).strict());
    await belongs(env, "workspaces", org, wid);
    await belongs(env, "brands", org, b.brand_id);
    const rename = env.DB.prepare(
      "UPDATE workspaces SET name=?,brand_id=CASE WHEN ? THEN ? ELSE brand_id END WHERE org_id=? AND id=? AND archived_at IS NULL",
    ).bind(b.name, Number(b.brand_id !== undefined), b.brand_id ?? null, org, wid);
    if (b.brand_id) {
      await env.DB.batch([rename, env.DB.prepare(
        `INSERT OR IGNORE INTO workspace_brands(org_id,workspace_id,brand_id,kind)
         SELECT b.org_id,w.id,b.id,b.kind FROM brands b JOIN workspaces w ON w.org_id=b.org_id
         WHERE b.org_id=? AND b.id=? AND w.id=? AND w.archived_at IS NULL`,
      ).bind(org, b.brand_id, wid)]);
    } else await rename.run();
    return json({ ok: true });
  }
  if (workspaceItem && method === "DELETE") {
    await belongs(env, "workspaces", org, workspaceItem[1]);
    await archiveWorkspace(env, org, workspaceItem[1]);
    return json({ ok: true });
  }
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
    const values = [org, workspaceBrand[1], workspaceBrand[2]];
    await env.DB.batch([
      env.DB.prepare("UPDATE workspaces SET brand_id=NULL WHERE org_id=? AND id=? AND brand_id=?").bind(...values),
      env.DB.prepare("UPDATE prompts SET brand_id=NULL WHERE org_id=? AND workspace_id=? AND brand_id=?").bind(...values),
      env.DB.prepare("DELETE FROM workspace_brands WHERE org_id=? AND workspace_id=? AND brand_id=?").bind(...values),
    ]);
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
          workspace_id: id.optional(),
        })
        .strict(),
    );
    await belongs(env, "workspaces", org, b.workspace_id);
    const bid = uuid();
    const brand = env.DB.prepare("INSERT INTO brands VALUES(?,?,?,?,?,?,?)").bind(
      bid,
      org,
      b.name,
      b.domain.toLowerCase().replace(/^www\./, ""),
      JSON.stringify(b.aliases),
      b.kind,
      now(),
    );
    if (b.workspace_id) {
      await env.DB.batch([brand, env.DB.prepare(
        "INSERT INTO workspace_brands(org_id,workspace_id,brand_id,kind) VALUES(?,?,?,?)",
      ).bind(org, b.workspace_id, bid, b.kind)]);
    } else await brand.run();
    return json({ id: bid }, 201);
  }
  const brandItem = path.match(/^\/brands\/([^/]+)$/);
  if (brandItem && method === "DELETE") {
    await belongs(env, "brands", org, brandItem[1]);
    await deleteBrand(env, org, brandItem[1]);
    return json({ ok: true });
  }
  if (brandItem && method === "PATCH") {
    const bid = brandItem[1];
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
    if (u.searchParams.get("view") === "library")
      return json(await listSavedPrompts(env, org, u.searchParams));
    return json({
      prompts: await all(
        env,
        "SELECT * FROM prompts WHERE org_id=? AND archived_at IS NULL" +
          (w ? " AND workspace_id=?" : "") +
          " ORDER BY created_at DESC LIMIT 500",
        org,
        ...(w ? [w] : []),
      ),
    });
  }
  if (path === "/prompts/bulk" && method === "POST")
    return json(await savePromptBatch(env, org, await body(req, promptBatchSchema, MAX_PROMPT_BATCH_BYTES)), 201);
  if (path === "/prompts/bulk" && method === "DELETE") {
    const b = await body(req, z.object({ ids: z.array(id).min(1).max(100) }).strict());
    const rows = await selectedRows(env, org, "prompts", b.ids);
    await archivePrompts(env, org, rows.map(row => String(row.id)));
    return json({ deleted: rows.length });
  }
  if (path === "/prompts/move" && method === "POST") {
    const b = await body(req, z.object({ ids: z.array(id).min(1).max(100), workspace_id: id }).strict());
    await belongs(env, "workspaces", org, b.workspace_id);
    const rows = await selectedRows(env, org, "prompts", b.ids);
    const changed = rows.filter(p => p.workspace_id !== b.workspace_id);
    if (changed.length) {
      const movedAt = now();
      await env.DB.batch(changed.map(p => env.DB.prepare(
        `UPDATE prompts SET workspace_id=?,updated_at=?,
         brand_id=CASE WHEN EXISTS(SELECT 1 FROM workspace_brands wb
           WHERE wb.org_id=prompts.org_id AND wb.workspace_id=? AND wb.brand_id=prompts.brand_id)
         THEN brand_id ELSE NULL END WHERE org_id=? AND id=? AND archived_at IS NULL`,
      ).bind(b.workspace_id, movedAt, b.workspace_id, org, p.id)));
    }
    return json({ moved: changed.length });
  }
  if (path === "/prompts" && method === "POST") {
    const b = await body(req, promptSchema);
    await assertProviderOptions([b.engine], b.location_name, b.language_code);
    await belongs(env, "workspaces", org, b.workspace_id);
    await requireWorkspaceBrand(env, org, b.workspace_id, b.brand_id);
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
  if (path === "/prompts/bulk-settings" && method === "PATCH") {
    const b=await body(req,bulkToggleSchema);const table=path.startsWith('/prompts')?'prompts':'schedules';
    const rows=await selectedRows(env,org,table,b.ids);
    await env.DB.batch(rows.map(row=>env.DB.prepare(`UPDATE ${table} SET enabled=?,mode=? WHERE org_id=? AND id=? AND archived_at IS NULL`).bind(b.enabled===undefined?row.enabled:Number(b.enabled),b.mode||row.mode,org,row.id)));
    return json({updated:rows.length});
  }
  const match = path.match(/^\/prompts\/([^/]+)(?:\/(run))?$/);
  if (match && !match[2] && method === "DELETE") {
    await belongs(env, "prompts", org, match[1]);
    await archivePrompts(env, org, [match[1]]);
    return json({ ok: true });
  }
  if (match && !match[2] && method === "GET") {
    const prompt = required(await one(env, "SELECT * FROM prompts WHERE org_id=? AND id=? AND archived_at IS NULL", org, match[1]), "Prompt not found");
    return json({ prompt });
  }
  if (match && method === "PATCH") {
    const b = await body(req, promptSchema);
    await assertProviderOptions([b.engine], b.location_name, b.language_code);
    await belongs(env, "prompts", org, match[1]);
    await belongs(env, "workspaces", org, b.workspace_id);
    await requireWorkspaceBrand(env, org, b.workspace_id, b.brand_id);
    await exec(
      env,
      "UPDATE prompts SET workspace_id=?,brand_id=?,text=?,engine=?,mode=?,location_name=?,language_code=?,enabled=?,updated_at=? WHERE id=? AND org_id=? AND archived_at IS NULL",
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
  if (path === "/runs/bulk" && method === "POST") {
    const result=await createBulkRuns(env,org,await body(req,bulkRunSchema));
    // Existing queued runs are recoverable by cron; no uncertain/accepted provider task is resubmitted.
    ctx.waitUntil(Promise.all(result.runs.filter(r=>r.status==='queued' && !r.workflow_started).slice(0,8).map(r=>launchRun(env,String(r.id)))));
    return json(result, result.complete?202:207);
  }
  if (path === "/schedules/bulk" && method === "POST") return json(await createBulkSchedules(env,org,await body(req,bulkScheduleSchema)),201);
  if (path === "/schedules/bulk" && method === "PATCH") return json(await updateBulkSchedules(env, org, await body(req,bulkScheduleUpdateSchema)));
  if (path === "/runs" && method === "GET") {
    const w = u.searchParams.get("workspace");
    const timestamp = u.searchParams.get("before");
    const before = Number(timestamp || now() + 1);
    const beforeId = u.searchParams.get("before_id");
    if (!Number.isFinite(before) || (beforeId !== null &&
      (!timestamp || !Number.isSafeInteger(before) || !id.safeParse(beforeId).success))) {
      throw new HttpError(400, "Invalid run history cursor");
    }
    if (w) await belongs(env, "workspaces", org, w, true);
    const { conditions, bindings } = historyWhere(org, u.searchParams);
    conditions.push(beforeId === null ? "created_at<?" : "(created_at,id)<(?,?)");
    bindings.push(before, ...(beforeId === null ? [] : [beforeId]));
    const pageSize = 100;
    const runs = await all(
      env,
      "SELECT id,prompt_id,workspace_id,prompt_text,config,status,mentions,citations,grounding_queries,discovered_brands,has_answer,error,provider_cost,created_at,updated_at FROM runs WHERE " +
        conditions.join(" AND ") + " ORDER BY created_at DESC,id DESC LIMIT ?",
      ...bindings,
      pageSize + 1,
    );
    const last = runs.length > pageSize ? runs[pageSize - 1] : null;
    return json({
      runs: runs.slice(0, pageSize).map(decodeRun),
      next_before: last?.created_at ?? null,
      next_before_id: last?.id ?? null,
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
  if (path === "/schedules" && method === "GET") {
    const workspace = u.searchParams.get("workspace");
    if (workspace) await belongs(env, "workspaces", org, workspace);
    return json({
      schedules: await all(
        env,
        `SELECT s.*,p.workspace_id,p.text AS prompt_text FROM schedules s
         JOIN prompts p ON p.org_id=s.org_id AND p.id=s.prompt_id
         WHERE s.org_id=? AND p.archived_at IS NULL${workspace ? " AND p.workspace_id=?" : ""} ORDER BY s.created_at DESC LIMIT 500`,
        org,
        ...(workspace ? [workspace] : []),
      ),
    });
  }
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
      await one<Row>(env, "SELECT id,name,created_at,resolve_poisoned_results FROM organizations WHERE id=?", org),
    );
    const configured = credentialStatus(p.keyId ? {} : await credentials(env, org));
    const periods = runUsagePeriods(now());
    const plan = await organizationPlan(env, org);
    const [counts, cost, monthly] = await Promise.all([
      runUsage(env, org, periods),
      one<{ reported_provider_cost: number }>(env,
        "SELECT COALESCE(SUM(provider_cost),0) AS reported_provider_cost FROM runs WHERE org_id=? AND created_at>=? AND created_at<?",
        org, periods.dayStart, periods.dayStart + 86400000),
      one<Row>(env, "SELECT operations FROM monthly_api_usage WHERE org_id=? AND month=?", org, periods.month.key),
    ]);
    const usage = { runs: counts?.daily ?? 0, reported_provider_cost: cost?.reported_provider_cost ?? 0 };
    return json({ ...o, ...configured, usage, role: t.role, plan,
      monthly_usage: { api_operations: monthly?.operations || 0, runs: counts?.monthly ?? 0, resets_at: periods.month.end } });
  }
  if (path === "/settings" && method === "PATCH") {
    admin(t);
    const b = await body(
      req,
      z
        .object({
          resolve_poisoned_results: z.boolean(),
          daily_run_limit: z.number().int().min(1).max(1000000).optional(),
        })
        .strict(),
    );
    await exec(
      env,
      "UPDATE organizations SET resolve_poisoned_results=? WHERE id=?",
      b.resolve_poisoned_results ? 1 : 0,
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
    const status = await updateCredentials(env, org, b);
    await audit(env, t, "credentials.updated", org);
    return json({ ok: true, ...status });
  }
  if (method === "DELETE" && (path === "/credentials/dataforseo" || path === "/credentials/openrouter")) {
    admin(t);
    const provider = path === "/credentials/dataforseo" ? "dataforseo" : "openrouter";
    const status = await updateCredentials(env, org, provider);
    await audit(env, t, `credentials.${provider}.removed`, org);
    return json({ ok: true, ...status });
  }
  if (path === "/credentials" && method === "DELETE") {
    admin(t);
    await removeAllCredentials(env, org);
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
        "SELECT id,role,recipient_email,expires_at,claimed_by,created_at FROM invites WHERE org_id=? ORDER BY created_at DESC LIMIT 100",
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
          email: z.string().trim().toLowerCase().email().max(254),
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
      "INSERT INTO invites(id,org_id,token_hash,role,expires_at,created_by,created_at,recipient_email) VALUES(?,?,?,?,?,?,?,?)",
      iid,
      org,
      await hashToken(raw),
      b.role,
      now() + 7 * 86400000,
      p.userId,
      now(),
      b.email,
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
    const workspace = u.searchParams.get("workspace");
    if (workspace) await belongs(env, "workspaces", org, workspace, true);
    const { conditions, bindings } = historyWhere(org, u.searchParams);
    const rows = await all<Row>(
      env,
      "SELECT id,prompt_text,status,config,mentions,citations,grounding_queries,provider_cost,created_at FROM runs WHERE " +
        conditions.join(" AND ") + " ORDER BY created_at DESC,id DESC LIMIT 1000",
      ...bindings,
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
