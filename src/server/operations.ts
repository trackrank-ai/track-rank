// Deployment-owner maintenance only. No plaintext key export or arbitrary mail destination.
import { eraseData } from "./erasure";
import { seal, hashToken } from "./crypto";
import { billingAlert, deliverBillingAlerts, stripeClient } from "./billing";
import { billingOffers } from "./billing-catalog";
import { HttpError, json, now, one, all, type Env } from "./types";
import { calendarMonth } from "./plans";
const recoveryTenant = "__trackrank_recovery_drill__";
function base64(bytes: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
export async function operations(req: Request, env: Env) {
  if (!env.OPERATIONS_TOKEN) throw new HttpError(404, "Not found");
  const provided = req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (await hashToken(provided) !== await hashToken(env.OPERATIONS_TOKEN)) throw new HttpError(403, "Operator authorization required");
  const path = new URL(req.url).pathname;
  if (req.method === "GET" && path === "/api/operations/readiness") {
    const stripe = stripeClient(env);
    const account = await stripe.accounts.retrieveCurrent();
    const stats = await one(env, "SELECT (SELECT count(*) FROM organizations) AS organizations,(SELECT count(*) FROM runs) AS runs,(SELECT count(*) FROM billing_customers) AS billing_customers,(SELECT count(*) FROM billing_alerts WHERE resolved_at IS NULL) AS unresolved_alerts");
    const cron = await one(env, "SELECT succeeded_at FROM operations_health WHERE name='cron'");
    const queue = await one(env, "SELECT sum(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued,min(CASE WHEN status='queued' THEN created_at END) AS oldest_queued_at,sum(CASE WHEN status='uncertain' THEN 1 ELSE 0 END) AS uncertain,sum(CASE WHEN status='submitted' AND created_at<? THEN 1 ELSE 0 END) AS stuck,sum(CASE WHEN status='failed' AND updated_at>? THEN 1 ELSE 0 END) AS recent_failures FROM runs",now()-24*3600000,now()-15*60000);
    const month = calendarMonth();
    const usage = await all(env,
      `SELECT u.org_id,u.runs,coalesce((SELECT sum(r.provider_cost) FROM runs r
        WHERE r.org_id=u.org_id AND r.created_at>=? AND r.created_at<?),0) AS provider_cost_usd
        FROM run_usage u WHERE u.period=?`, month.start, month.end, month.key);
    return json({ cron_succeeded_at: cron?.succeeded_at || null, queue, organization_usage:usage, infrastructure_dollars_measured:false, stripe: { account_id: account.id, charges_enabled: account.charges_enabled, payouts_enabled: account.payouts_enabled }, email_configured: !!(env.RESEND_API_KEY && env.EMAIL_FROM), google_configured: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), alert_recipient_configured: !!env.BILLING_ALERT_EMAIL, checkout_enabled: (await billingOffers(env)).length > 0, stats });
  }
  if (req.method !== "POST") throw new HttpError(405, "POST required");
  if (path === "/api/operations/erase") return json(await eraseData(env, await req.json()));
  if (path === "/api/operations/backup-keys") {
    if (!env.RECOVERY_PUBLIC_KEY) throw new HttpError(503, "Recovery public key is not configured");
    const spki = Uint8Array.from(atob(env.RECOVERY_PUBLIC_KEY.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("spki", spki, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
    const plaintext = new TextEncoder().encode(JSON.stringify({ AUTH_SECRET: env.AUTH_SECRET, CREDENTIALS_KEY: env.CREDENTIALS_KEY }));
    const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, plaintext);
    const marker = crypto.randomUUID();
    const canary = await seal(env, recoveryTenant, { marker });
    return json({ version: 1, algorithm: "RSA-OAEP-SHA256", created_at: new Date().toISOString(), encrypted_keys: base64(encrypted), canary, canary_tenant: recoveryTenant, canary_marker: marker });
  }
  if (path === "/api/operations/backup-r2") {
    if (!env.BACKUPS) throw new HttpError(503, "Backup bucket is not configured");
    const u = new URL(req.url);
    const snapshot = u.searchParams.get("snapshot") || new Date().toISOString().replace(/[:.]/g, "-");
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(snapshot)) throw new HttpError(400, "Invalid snapshot identifier");
    const page = await env.ANSWERS.list({ limit: 50, cursor: u.searchParams.get("cursor") || undefined });
    let copied = 0;
    for (const item of page.objects) {
      const object = await env.ANSWERS.get(item.key);
      if (!object) throw new HttpError(409, "Source changed during backup; retry");
      const destination = `snapshots/${snapshot}/answers/${item.key}`;
      await env.BACKUPS.put(destination, object.body, { httpMetadata: object.httpMetadata, customMetadata: { ...object.customMetadata, source_etag: item.etag } });
      const saved = await env.BACKUPS.head(destination);
      if (!saved || saved.size !== item.size || saved.customMetadata?.source_etag !== item.etag) throw new HttpError(503, "Backup verification failed");
      copied++;
    }
    // Encrypted marker proves a recovered key can decrypt an independently restored R2 object.
    const marker = crypto.randomUUID();
    const canary = await seal(env, recoveryTenant, { marker });
    const canaryPath = `snapshots/${snapshot}/recovery-canary.json`;
    await env.BACKUPS.put(canaryPath, canary);
    const restored = await env.BACKUPS.get(canaryPath);
    if (!restored || await restored.text() !== canary) throw new HttpError(503, "R2 restore read failed");
    return json({ snapshot, copied, complete: !page.truncated, cursor: page.truncated ? page.cursor : null, canary, canary_tenant: recoveryTenant, canary_marker: marker });
  }
  if (path === "/api/operations/test-alert") {
    if (!env.BILLING_ALERT_EMAIL || !env.RESEND_API_KEY || !env.EMAIL_FROM) throw new HttpError(503, "Alert email configuration incomplete");
    const id = `delivery-drill:${crypto.randomUUID()}`;
    await billingAlert(env, id, null, "delivery_drill", "production-readiness", "Benign TrackRank billing readiness drill. No payment, customer data or credentials are included.");
    const message_ids = await deliverBillingAlerts(env);
    const record = await one(env, "SELECT notified_at FROM billing_alerts WHERE id=?", id);
    return json({ id, provider_accepted: !!record?.notified_at, message_ids });
  }
  if (path === "/api/operations/test-support") {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.PUBLIC_SUPPORT_EMAIL) throw new HttpError(503, "Support email configuration incomplete");
    const r = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [env.PUBLIC_SUPPORT_EMAIL], subject: "TrackRank support delivery verification", text: `Benign support readiness drill ${now()}. No payment, customer data or credentials are included.` }) });
    if (!r.ok) throw new HttpError(502, "Support message was not accepted");
    const data = await r.json() as { id: string };
    return json({ id: data.id, provider_accepted: true });
  }
  if (path === "/api/operations/email-status") {
    const data = await req.json() as { id?: string };
    if (!data.id || !/^[0-9a-f-]{36}$/i.test(data.id)) throw new HttpError(400, "Email identifier required");
    if (!env.RESEND_API_KEY) throw new HttpError(503, "Email not configured");
    const r = await fetch(`https://api.resend.com/emails/${data.id}`, { signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } });
    if (!r.ok) throw new HttpError(502, "Email status unavailable");
    const sent = await r.json() as { to: string[]; last_event: string };
    const allowed = [env.PUBLIC_SUPPORT_EMAIL, env.BILLING_ALERT_EMAIL];
    if (!sent.to.every(to => allowed.includes(to))) throw new HttpError(403, "Not an operator delivery drill");
    return json({ id: data.id, last_event: sent.last_event });
  }
  throw new HttpError(404, "Not found");
}
