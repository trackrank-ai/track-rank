import { billingAccount, billingAdminUpdate, canManageBilling, updateBillingAdmins } from "./billing-account";
import Stripe from "stripe";
import { z } from "zod";
import { billingOffers, publicBillingOffers } from "./billing-catalog";
import { hashToken } from "./crypto";
import { body } from "./request-body";
import { organizationPlan } from "./plans";
import { enforceLimit } from "./rate-limit";
import { HttpError, all, exec, json, now, one, type Env, type Principal, type Row } from "./types";

export function stripeClient(env: Env) {
  if (env.BILLING_ENABLED !== "true" || !env.STRIPE_SECRET_KEY)
    throw new HttpError(503, "Hosted billing is not enabled");
  return new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2, timeout: 15000 });
}
const checkoutOffer = z.object({ offer_key: z.string().max(64).regex(/^[a-z0-9][a-z0-9-]*$/) }).strict();
const checkoutRevision = "billing-account-v1";
export async function billingRoute(req: Request, env: Env, p: Principal, path: string) {
  const org = p.orgId!;
  const account = await billingAccount(env, org);
  const manage = await canManageBilling(env, p);
  const isOwner = !!await one(env, "SELECT 1 FROM memberships WHERE org_id=? AND user_id=? AND role='owner'", org, p.userId);
  if (path === "/billing/admins" && req.method === "GET") {
    if (!isOwner) throw new HttpError(403, "Only an owner can list billing delegates");
    return json({ members: await all(env, `SELECT m.user_id,m.role,u.name,u.email,
      EXISTS(SELECT 1 FROM billing_account_admins a WHERE a.org_id=m.org_id AND a.user_id=m.user_id) AS billing_admin
      FROM memberships m JOIN user u ON u.id=m.user_id WHERE m.org_id=? ORDER BY u.name,m.user_id`, org) });
  }
  if (req.method !== "GET") await enforceLimit(env, `billing:${account.id}`, 10);
  if (["/billing/handoff", "/billing/admin-handoff"].includes(path) && req.method === "GET") {
    if (!manage) throw new HttpError(403, "Billing administrator access required");
    const delegation = path === "/billing/admin-handoff";
    if (delegation && !await one(env, "SELECT 1 FROM memberships WHERE org_id=? AND user_id=? AND role='owner'", org, p.userId))
      throw new HttpError(403, "Only an owner can delegate billing");
    return json({ url: `${env.BASE_URL}/app?${new URLSearchParams({org,tab:"settings"})}`, requires_interactive_session: true });
  }
  if (path === "/billing/admins" && req.method === "PATCH")
    return json(await updateBillingAdmins(env, p, await body(req, billingAdminUpdate)));
  if (path !== "/billing") {
    if (p.keyId) throw new HttpError(403, "Sign in to manage billing");
    if (!manage) throw new HttpError(403, "An owner or billing administrator session is required");
  }
  if (req.method === "GET" && path === "/billing") {
    await enforceLimit(env, `billing-read:${org}`, 60);
    const state = await one<Row>(env, "SELECT status,current_period_end,cancel_at_period_end,risk_hold FROM billing_accounts WHERE org_id=?", org);
    const trial = await one<Row>(env, "SELECT started_at,ends_at FROM organization_trials WHERE org_id=?", org);
    const assignment = await one<Row>(env, "SELECT p.family,p.price_cents FROM organization_plans a JOIN plan_versions p ON p.id=a.plan_version_id WHERE a.org_id=?", org);
    let accessStatus = assignment?.family === "pending" ? "choose_plan" : "assigned";
    if (assignment?.family === "trial") accessStatus = Number(trial?.ends_at) > now() ? "free_trial" : "trial_expired";
    if (Number(assignment?.price_cents) > 0) {
      try {
        await organizationPlan(env, org);
      } catch (error) {
        if (!(error instanceof HttpError) || error.status !== 402) throw error;
        accessStatus = "payment_required";
      }
    }
    const offers = publicBillingOffers(await billingOffers(env));
    return json({ enabled: env.BILLING_ENABLED === "true", checkout_enabled: offers.length > 0, offers, ...state, has_stripe_customer: !!account.customer_id, free_trial: trial, access_status: accessStatus, billing_account_id: account.id, can_manage_billing: manage, owner: isOwner });
  }

  if (req.method === "GET" && path === "/billing/alerts") return json({ alerts: await all(env, "SELECT id,kind,summary,created_at FROM billing_alerts WHERE org_id=? AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 50", org) });
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  if (path !== "/billing/checkout" && path !== "/billing/portal") throw new HttpError(404, "Not found");
  const stripe = stripeClient(env);
  const settingsUrl = new URL("/app", env.BASE_URL);
  settingsUrl.search = new URLSearchParams({ org, tab: "settings" }).toString();
  let customer = account;
  if (path === "/billing/portal") {
    if (!customer.customer_id) throw new HttpError(409, "No Stripe customer yet");
    if (!env.STRIPE_PORTAL_CONFIGURATION) throw new HttpError(503, "Customer portal setup is pending");
    const session = await stripe.billingPortal.sessions.create({ customer: String(customer.customer_id), configuration: env.STRIPE_PORTAL_CONFIGURATION, return_url: settingsUrl.href });
    return json({ url: session.url });
  }
  const offers = await billingOffers(env);
  if (!offers.length) throw new HttpError(503, "New subscriptions are temporarily paused; existing billing management remains available");
  const { offer_key } = await body(req, checkoutOffer, 1024);
  const mapping = offers.find(offer => offer.offer_key === offer_key);
  if (!mapping) throw new HttpError(404, "This subscription offer is unavailable");
  const priceId = mapping.price_id;
  const price = await stripe.prices.retrieve(priceId);
  if (!price.active || price.unit_amount !== mapping.price_cents || price.currency !== mapping.currency || price.recurring?.interval !== mapping.interval || price.recurring?.interval_count !== 1)
    throw new HttpError(503, "Stripe price does not match the plan revision");
  const automaticTax = false; // Explicit Checkout Studio configuration; tax policy reviewed by owner.
  const lockToken = crypto.randomUUID();
  const lock = await one(env, `INSERT INTO billing_checkout_locks VALUES(?,?,?)
    ON CONFLICT(billing_account_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at
    WHERE billing_checkout_locks.expires_at<? RETURNING token`, account.id, lockToken, now() + 120000, now());
  if (!lock) throw new HttpError(409, "Checkout is already being prepared; retry shortly");
  try {
  if (!customer.customer_id) {
    const created = await stripe.customers.create({ metadata: { trackrank_billing_account: String(account.id) } }, { idempotencyKey: `trackrank-customer:${account.id}` });
    await exec(env, "UPDATE billing_accounts SET customer_id=?,updated_at=? WHERE id=? AND customer_id IS NULL", created.id, now(), account.id);
    customer = await billingAccount(env, org);
  }
  const customerId = String(customer!.customer_id);
  const existing = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  if (existing.has_more || existing.data.some(s => !["canceled", "incomplete_expired"].includes(s.status)))
    throw new HttpError(409, "An existing subscription requires attention; use Manage billing");
  const open = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 });
  if (open.has_more) throw new HttpError(409, "Too many open checkouts; operator review required");
  const matchesOffer = (s: Stripe.Checkout.Session) => s.metadata?.trackrank_checkout_revision === checkoutRevision && s.metadata?.trackrank_offer === offer_key && s.metadata?.trackrank_price === priceId && s.automatic_tax?.enabled === automaticTax;
  const compatible = open.data.find(matchesOffer);
  if (compatible?.url) return json({ url: compatible.url });
  for (const stale of open.data) await stripe.checkout.sessions.expire(stale.id);
  const window = Math.floor(Date.now() / 1000 / 1800) * 1800;
  const expired = await stripe.checkout.sessions.list({ customer: customerId, status: "expired", created: { gte: window }, limit: 100 });
  if (expired.has_more) throw new HttpError(409, "Too many recent checkouts; retry later");
  // A customer may return to an offer whose previous session was expired when they switched.
  const lastExpired = expired.data.find(matchesOffer)?.id ?? "new";
  const attempt = await hashToken(JSON.stringify([org, offer_key, priceId, automaticTax, window, lastExpired]));
  const session = await stripe.checkout.sessions.create({
    customer: customerId, mode: "subscription", line_items: [{ price: priceId, quantity: 1 }],
    automatic_tax: { enabled: automaticTax },
    ui_mode: "hosted_page",
    phone_number_collection: { enabled: false },
    allow_promotion_codes: false,
    origin_context: "web",
    payment_method_collection: "always",
    billing_address_collection: "auto",
    success_url: settingsUrl.href, cancel_url: settingsUrl.href,
    metadata: { trackrank_checkout_revision: checkoutRevision, trackrank_offer: offer_key, trackrank_price: priceId },
    integration_identifier: "hosted_web_0001",
    expires_at: window + 3600,
  }, { idempotencyKey: `trackrank-checkout:${checkoutRevision}:${attempt}` });
  return json({ url: session.url });
  } finally {
    await exec(env, "DELETE FROM billing_checkout_locks WHERE billing_account_id=? AND token=?", account.id, lockToken);
  }
}

export async function syncSubscription(env: Env, subscription: Stripe.Subscription, event: Stripe.Event, lease?: { token: string; customerId: string }) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const customer = await one<Row>(env, "SELECT * FROM billing_accounts WHERE customer_id=?", customerId);
  if (!customer) return; // Never adopt arbitrary customer metadata as tenant ownership.
  if (customer.subscription_id && customer.subscription_id !== subscription.id && !["canceled", "incomplete_expired"].includes(String(customer.status)))
    throw new HttpError(409, "Conflicting subscription; operator reconciliation required");
  const item = subscription.items.data[0];
  const mapping = item && await one<Row>(env, "SELECT p.* FROM billing_prices b JOIN plan_versions p ON p.id=b.plan_version_id WHERE b.price_id=? AND b.livemode=?", item.price.id, Number(event.livemode));
  if (!mapping || subscription.items.data.length !== 1 || item.quantity !== 1 || item.price.unit_amount !== mapping.price_cents || item.price.currency !== mapping.currency)
    throw new HttpError(409, "Unrecognized subscription price; operator reconciliation required");
  // Batch is transactional. Event marker, subscription state and entitlement assignment succeed together.
  // Strictly older events cannot overwrite newer state. Each event retrieves CURRENT Stripe state.
  let guard = "NOT EXISTS(SELECT 1 FROM billing_events WHERE event_id=?) AND EXISTS(SELECT 1 FROM billing_accounts WHERE org_id=? AND event_created<=?)";
  const args: unknown[] = [event.id, customer.org_id, event.created];
  if (lease) {
    guard += " AND EXISTS(SELECT 1 FROM billing_sync_locks WHERE customer_id=? AND token=? AND expires_at>?)";
    args.push(lease.customerId, lease.token, now());
  }
  const stmts = [];
  if (subscription.status === "active") stmts.push(env.DB.prepare(`UPDATE organization_plans SET plan_version_id=?,assigned_at=?,reason=? WHERE org_id=? AND ${guard}`).bind(mapping.id, now(), "Verified Stripe subscription", customer.org_id, ...args));
  stmts.push(env.DB.prepare(`UPDATE billing_accounts SET subscription_id=?,status=?,price_id=?,current_period_end=?,cancel_at_period_end=?,event_created=?,updated_at=? WHERE org_id=? AND ${guard}`).bind(subscription.id, subscription.status, item.price.id, item.current_period_end * 1000, Number(subscription.cancel_at_period_end), event.created, now(), customer.org_id, ...args));
  stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO billing_events SELECT ?,?,? WHERE ${lease ? "EXISTS(SELECT 1 FROM billing_sync_locks WHERE customer_id=? AND token=? AND expires_at>?)" : "1"}`).bind(event.id, event.type, now(), ...(lease ? [lease.customerId, lease.token, now()] : [])));
  await env.DB.batch(stmts);
}
export async function stripeWebhook(req: Request, env: Env) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const stripe = stripeClient(env);
  if (!env.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, "Webhook setup pending");
  const payload = await req.text();
  if (payload.length > 1048576) throw new HttpError(413, "Webhook too large");
  let event: Stripe.Event;
  try { event = await stripe.webhooks.constructEventAsync(payload, req.headers.get("stripe-signature") || "", env.STRIPE_WEBHOOK_SECRET, 300, Stripe.createSubtleCryptoProvider()); }
  catch { throw new HttpError(400, "Invalid Stripe signature"); }
  if (event.livemode !== !env.STRIPE_SECRET_KEY!.includes("_test_")) throw new HttpError(400, "Stripe environment mismatch");
  if (await one(env, "SELECT event_id FROM billing_events WHERE event_id=?", event.id)) return json({ received: true });
  const object = event.data.object;
  let subscriptionId: string | undefined;
  if (event.type.startsWith("customer.subscription.")) subscriptionId = (object as Stripe.Subscription).id;
  else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const sub = (object as Stripe.Invoice).parent?.subscription_details?.subscription;
    subscriptionId = typeof sub === "string" ? sub : sub?.id;
  } else if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
    const session = object as Stripe.Checkout.Session;
    subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  }
  try {
    if (["charge.refunded", "charge.dispute.created", "radar.early_fraud_warning.created"].includes(event.type)) {
      await riskEvent(env, stripe, event);
    } else if (subscriptionId) await refreshSubscription(env, subscriptionId, event);
  } catch (error) {
    if (error instanceof HttpError && error.status === 409 && /Unrecognized|Conflicting/.test(error.message)) {
      const sub = subscriptionId && await stripe.subscriptions.retrieve(subscriptionId);
      if (sub) await exec(env, "UPDATE billing_accounts SET risk_hold=1 WHERE customer_id=?", typeof sub.customer === "string" ? sub.customer : sub.customer.id);
    }
    await billingAlert(env, `event:${event.id}`, null, "webhook_failed", event.id, "Billing webhook failed; inspect Stripe delivery and reconcile before resolving.");
    throw error;
  }
  return json({ received: true });
}

export async function billingAlert(env: Env, id: string, org: string | null, kind: string, resource: string, summary: string) {
  await exec(env, "INSERT OR IGNORE INTO billing_alerts(id,org_id,kind,resource_id,summary,created_at) VALUES(?,?,?,?,?,?)", id, org, kind, resource, summary, now());
  console.error("TrackRank billing attention", kind, resource); // Never payloads, addresses or keys.
}
async function withCustomerLock<T>(env: Env, customerId: string, action: (lease: { token: string; customerId: string }) => Promise<T>) {
  const token = crypto.randomUUID();
  const acquire = () => one(env, `INSERT INTO billing_sync_locks VALUES(?,?,?) ON CONFLICT(customer_id)
    DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE expires_at<? RETURNING token`, customerId, token, now() + 120000, now());
  let lock = await acquire();
  for (let attempt=0; !lock && attempt<10; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 200));
    lock = await acquire();
  }
  if (!lock) throw new HttpError(409, "Billing synchronization in progress; retry");
  try { return await action({ token, customerId }); }
  finally { await exec(env, "DELETE FROM billing_sync_locks WHERE customer_id=? AND token=?", customerId, token); }
}
export async function refreshSubscription(env: Env, id: string, event: Stripe.Event) {
  const stripe = stripeClient(env);
  // First read locates ownership only. The authoritative snapshot is retrieved AFTER locking.
  const locate = await stripe.subscriptions.retrieve(id);
  const customerId = typeof locate.customer === "string" ? locate.customer : locate.customer.id;
  return withCustomerLock(env, customerId, async lease => {
    const current = await stripe.subscriptions.retrieve(id);
    await syncSubscription(env, current, event, lease);
    if (!await one(env, "SELECT event_id FROM billing_events WHERE event_id=?", event.id))
      throw new HttpError(409, "Billing synchronization lease expired; retry");
  });
}
export async function riskEvent(env: Env, stripe: Stripe, event: Stripe.Event) {
  const object = event.data.object as unknown as { id: string; charge?: string | Stripe.Charge };
  const charge = event.type === "charge.refunded" ? object as unknown as Stripe.Charge :
    typeof object.charge === "string" ? await stripe.charges.retrieve(object.charge) : object.charge;
  if (!charge) throw new HttpError(409, "Risk event charge correlation unavailable");
  const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!intentId) throw new HttpError(409, "Risk event payment correlation unavailable");
  // On Basil+ Charge.invoice is gone. Resolve through Invoice Payments, not metadata.
  const payments = await stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: intentId }, limit: 100 });
  if (payments.has_more) throw new HttpError(409, "Risk event requires pagination reconciliation");
  let matched = false;
  for (const payment of payments.data) {
    const invoice = typeof payment.invoice === "string" ? await stripe.invoices.retrieve(payment.invoice) : payment.invoice;
    if ("deleted" in invoice) continue;
    const sub = invoice.parent?.subscription_details?.subscription;
    const subId = typeof sub === "string" ? sub : sub?.id;
    if (!subId) continue;
    const subscription = await stripe.subscriptions.retrieve(subId);
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const customer = await one<Row>(env, "SELECT org_id FROM billing_accounts WHERE customer_id=?", customerId);
    if (!customer) continue;
    matched = true;
    await withCustomerLock(env, customerId, async () => {
      // Disputes and fraud warnings suspend paid access pending operator review.
      // Refunds are recorded for review; a refund does not cancel a subscription.
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO billing_alerts(id,org_id,kind,resource_id,summary,created_at) VALUES(?,?,?,?,?,?)").bind(`${event.id}:${subId}`, customer.org_id, event.type, charge.id, "Review Stripe charge and subscription; resolve refund or risk case with customer.", now()),
        env.DB.prepare("UPDATE billing_accounts SET risk_hold=CASE WHEN ?='charge.refunded' THEN risk_hold ELSE 1 END WHERE customer_id=?").bind(event.type, customerId),
      ]);
    });
  }
  if (!matched) await billingAlert(env, `risk:${event.id}`, null, "risk_unmatched", charge.id, "Risk event has no mapped subscription; inspect Stripe object graph.");
  await exec(env, "INSERT OR IGNORE INTO billing_events VALUES(?,?,?)", event.id, event.type, now());
}
export async function reconcileBilling(env: Env) {
  if (env.BILLING_ENABLED !== "true") return;
  const stripe = stripeClient(env);
  const requested = Number(env.BILLING_RECONCILE_BATCH || 10);
  const batch = Number.isSafeInteger(requested) ? Math.min(25, Math.max(1, requested)) : 10;
  const customers = await all<Row>(env, "SELECT * FROM billing_accounts WHERE customer_id IS NOT NULL ORDER BY reconcile_at LIMIT ?", batch);
  for (const customer of customers) {
    try {
      const subscriptions = await stripe.subscriptions.list({ customer: String(customer.customer_id), status: "all", limit: 100 });
      const current = subscriptions.data.filter(s => !["canceled", "incomplete_expired"].includes(s.status));
      if (subscriptions.has_more || current.length > 1) {
        await exec(env, "UPDATE billing_accounts SET risk_hold=1 WHERE org_id=?", customer.org_id);
        throw new HttpError(409, "Multiple subscriptions require operator review");
      }
      const id = current[0]?.id || customer.subscription_id;
      if (id) await refreshSubscription(env, String(id), { id: `reconcile:${crypto.randomUUID()}`, type: "customer.subscription.updated", created: Math.floor(now() / 1000), livemode: !env.STRIPE_SECRET_KEY!.includes("_test_") } as Stripe.Event);
      else await exec(env, "UPDATE billing_accounts SET updated_at=? WHERE org_id=?", now(), customer.org_id);
    } catch {
      await billingAlert(env, `reconcile:${customer.org_id}:${new Date().toISOString().slice(0, 10)}`, String(customer.org_id), "reconciliation_failed", String(customer.customer_id), "Subscription reconciliation failed; review Stripe and local plan mapping.");
    } finally {
      await exec(env, "UPDATE billing_accounts SET reconcile_at=? WHERE org_id=?", now(), customer.org_id);
    }
  }
  await deliverBillingAlerts(env);
  await exec(env, "DELETE FROM billing_events WHERE processed_at<?", now() - 90 * 86400000);
}
export async function deliverBillingAlerts(env: Env) {
  if (!env.BILLING_ALERT_EMAIL || !env.RESEND_API_KEY || !env.EMAIL_FROM) return [];
  const messageIds: string[] = [];
  const alerts = await all<Row>(env, "SELECT * FROM billing_alerts WHERE notified_at IS NULL AND resolved_at IS NULL ORDER BY created_at LIMIT 20");
  for (const alert of alerts) {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `trackrank-billing-${alert.id}` }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [env.BILLING_ALERT_EMAIL], subject: `TrackRank billing: ${alert.kind}`, text: `${alert.summary}\nResource: ${alert.resource_id}\nAlert: ${alert.id}\nReview Stripe Dashboard and the billing operations runbook. No customer content is included.` }) });
    if (!response.ok) throw new HttpError(503, "Billing alert notification failed");
    const sent = await response.json() as { id?: string };
    if (sent.id) messageIds.push(sent.id);
    await exec(env, "UPDATE billing_alerts SET notified_at=? WHERE id=?", now(), alert.id);
  }
  return messageIds;
}
