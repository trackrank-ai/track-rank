import { discoveryResponse } from "./server/seo";
import { workflowId } from "./server/dispatch";
import { maintenance } from "./server/erasure";
import { operations } from "./server/operations";
import { stripeWebhook, reconcileBilling } from "./server/billing";
import { publicSettings } from "./server/public-settings";
import handler from "@tanstack/react-start/server-entry";
import { api } from "./server/api";
import { localAuthEnabled } from "./server/local-auth";
import { auth } from "./server/auth";
import { callbackSignature, hashToken } from "./server/crypto";
import { mcp } from "./server/mcp";
import { sweep } from "./server/scheduler";
import {
  HttpError,
  json,
  one,
  type Ctx,
  type Env,
  type Row,
} from "./server/types";
export { TrackingWorkflow } from "./server/workflow";
const appWorker = {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const u = new URL(req.url);
    if (
      env.BASE_URL.startsWith("https:") &&
      u.host !== new URL(env.BASE_URL).host &&
      !u.pathname.startsWith("/api/") &&
      u.pathname !== "/mcp"
    )
      return Response.redirect(env.BASE_URL + u.pathname + u.search, 308);
    try {
      if (u.pathname.startsWith("/api/operations/")) return await operations(req, env);
      if (maintenance(env) && u.pathname !== "/api/health" && u.pathname !== "/api/billing/webhook") throw new HttpError(503, "Scheduled maintenance", { "Retry-After": "600" });
      const discovery = discoveryResponse(u.pathname, env.BASE_URL);
      if (discovery && (req.method === "GET" || req.method === "HEAD")) return req.method === "HEAD" ? new Response(null, { headers: discovery.headers }) : discovery;
      if (u.pathname === "/.well-known/security.txt") {
        const { email } = publicSettings(env);
        if (!email) return new Response("Security contact not configured", { status: 404 });
        const origin = new URL(env.BASE_URL).origin;
        return new Response([
          `Contact: mailto:${email}`,
          `Expires: ${new Date(Date.now() + 180 * 86400000).toISOString()}`,
          "Preferred-Languages: en",
          `Canonical: ${origin}/.well-known/security.txt`,
          `Policy: ${origin}/security`,
          "",
        ].join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
      }
      if (u.pathname === "/api/health")
        return json({
          ok: true,
          version: "0.1.0",
          google_auth: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
          email_auth: localAuthEnabled(env) || !!(env.RESEND_API_KEY && env.EMAIL_FROM),
          local_auth: localAuthEnabled(env),
          signup_enabled: env.SIGNUP_ENABLED === "true",
        });
      if (u.pathname.startsWith("/api/provider-callback/")) {
        const runId = u.pathname.split("/").pop() || "";
        const provided = u.searchParams.get("signature") || "";
        const expected = await callbackSignature(env, runId);
        if ((await hashToken(provided)) !== (await hashToken(expected)))
          throw new HttpError(403, "Invalid callback signature");
        const run = await one<Row>(
          env,
          "SELECT task_id,status,workflow_generation FROM runs WHERE id=?",
          runId,
        );
        if (!run || String(run.task_id) !== u.searchParams.get("task"))
          throw new HttpError(
            409,
            "Task correlation not ready or does not match",
          );
        if (run.status === "submitted") {
          try {
            const instance = await env.RUN_WORKFLOW.get(workflowId(runId, Number(run.workflow_generation)));
            await instance.sendEvent({
              type: "provider-ready",
              payload: { taskId: run.task_id },
            });
          } catch {
            /* Durable polling recovers lost events. */
          }
        }
        return json({ accepted: true }, 202);
      }
      if (u.pathname === "/api/billing/webhook") return await stripeWebhook(req, env);
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.get("origin");
        if (origin && origin !== env.BASE_URL)
          throw new HttpError(403, "Origin not allowed");
        if (
          !origin &&
          !req.headers.get("authorization") &&
          !u.pathname.startsWith("/api/auth/") &&
          u.pathname.startsWith("/api/")
        )
          throw new HttpError(
            403,
            "Browser writes require an Origin header; agents must use an API key",
          );
      }
      if (u.pathname.startsWith("/api/auth/")) {
        if (
          ((u.pathname.includes("sign-up") && !localAuthEnabled(env)) ||
            u.pathname.includes("request-password-reset")) &&
          (!env.RESEND_API_KEY || !env.EMAIL_FROM)
        )
          throw new HttpError(
            503,
            "Email authentication setup is pending. Configure the email provider first.",
          );
        return await auth(env).handler(req);
      }
      if (u.pathname === "/mcp") return await mcp(req, env, ctx);
      if (u.pathname.startsWith("/api/v1/")) return await api(req, env, ctx);
      return await handler.fetch(req);
    } catch (e) {
      if (e instanceof HttpError) {
        const response = json({ error: e.message }, e.status);
        for (const [key, value] of Object.entries(e.headers)) response.headers.set(key, value);
        return response;
      }
      console.error(
        "TrackRank request failed",
        u.pathname,
        e instanceof Error ? e.name : "unknown",
      );
      return json(
        {
          error:
            "The request failed. Please retry or contact your administrator.",
        },
        500,
      );
    }
  },
  async scheduled(_event: unknown, env: Env, ctx: Ctx) {
    if (maintenance(env)) return;
    ctx.waitUntil(Promise.all([sweep(env), reconcileBilling(env)]).then(() => env.DB.prepare("INSERT INTO operations_health(name,succeeded_at) VALUES('cron',?) ON CONFLICT(name) DO UPDATE SET succeeded_at=excluded.succeeded_at").bind(Date.now()).run()));
  },
};

export default {
  async fetch(req: Request, env: Env, ctx: Ctx) {
    const response = await appWorker.fetch(req, env, ctx);
    const h = new Headers(response.headers);
    h.set("X-Content-Type-Options", "nosniff");
    h.set("X-Frame-Options", "DENY");
    h.set("Referrer-Policy", "strict-origin-when-cross-origin");
    h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (new URL(req.url).protocol === "https:")
      h.set("Strict-Transport-Security", "max-age=31536000");
    const path = new URL(req.url).pathname;
    if (
      path.startsWith("/api/") ||
      ["/app", "/login", "/setup", "/mcp"].includes(path)
    ) {
      h.set("Cache-Control", "no-store");
      h.set("X-Robots-Tag", "noindex");
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: h,
    });
  },
  scheduled: appWorker.scheduled,
};
