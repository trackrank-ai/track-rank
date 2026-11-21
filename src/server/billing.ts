import Stripe from "stripe";
import { enforceLimit } from "./rate-limit";
import { HttpError, exec, json, now, one, type Env, type Principal, type Row } from "./types";

export function stripeClient(env: Env) {
  if (env.BILLING_ENABLED !== "true" || !env.STRIPE_SECRET_KEY)
    throw new HttpError(503, "Hosted billing is not enabled");
  return new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2, timeout: 15000 });
}
export function paidStatus(status: string) { return status === "active"; }
export async function billingRoute(req: Request, env: Env, p: Principal, path: string) {
  if (p.keyId) throw new HttpError(403, "Sign in to manage billing");
  const org = p.orgId!;
  if (req.method === "GET" && path === "/billing") {
    const state = await one<Row>(env, "SELECT status,current_period_end,cancel_at_period_end FROM billing_customers WHERE org_id=?", org);
    return json({ enabled: env.BILLING_ENABLED === "true", ...state });
  }
  if (p.role !== "owner") throw new HttpError(403, "Only the organization owner can manage billing");
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  await enforceLimit(env, `billing:${org}`, 10);
  const stripe = stripeClient(env);
  let customer = await one<Row>(env, "SELECT * FROM billing_customers WHERE org_id=?", org);
  if (path === "/billing/portal") {
    if (!customer) throw new HttpError(409, "No billing account yet");
    if (!env.STRIPE_PORTAL_CONFIGURATION) throw new HttpError(503, "Customer portal setup is pending");
    const session = await stripe.billingPortal.sessions.create({ customer: String(customer.customer_id), configuration: env.STRIPE_PORTAL_CONFIGURATION, return_url: `${env.BASE_URL}/app` });
    return json({ url: session.url });
  }
  if (path !== "/billing/checkout") throw new HttpError(404, "Not found");
  const priceId = env.STRIPE_STARTER_PRICE_ID;
  const mapping = priceId && await one<Row>(env, `SELECT p.* FROM billing_prices b JOIN plan_versions p ON p.id=b.plan_version_id WHERE b.price_id=? AND p.status='active'`, priceId);
  if (!mapping || mapping.id !== "starter-v1") throw new HttpError(503, "Starter billing price is not configured");
  const price = await stripe.prices.retrieve(priceId!);
  if (!price.active || price.unit_amount !== mapping.price_cents || price.currency !== mapping.currency || price.recurring?.interval !== mapping.interval || price.recurring?.interval_count !== 1)
    throw new HttpError(503, "Stripe price does not match the plan revision");
  const lockToken = crypto.randomUUID();
  const lock = await one(env, `INSERT INTO billing_checkout_locks VALUES(?,?,?)
    ON CONFLICT(org_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at
    WHERE billing_checkout_locks.expires_at<? RETURNING token`, org, lockToken, now() + 120000, now());
  if (!lock) throw new HttpError(409, "Checkout is already being prepared; retry shortly");
  try {
  if (!customer) {
    const created = await stripe.customers.create({ metadata: { trackrank_org: org } }, { idempotencyKey: `trackrank-customer:${org}` });
    await exec(env, "INSERT OR IGNORE INTO billing_customers(org_id,customer_id,updated_at) VALUES(?,?,?)", org, created.id, now());
    customer = await one<Row>(env, "SELECT * FROM billing_customers WHERE org_id=?", org);
  }
  const customerId = String(customer!.customer_id);
  const existing = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  if (existing.has_more || existing.data.some(s => !["canceled", "incomplete_expired"].includes(s.status)))
    throw new HttpError(409, "An existing subscription requires attention; use Manage billing");
  const open = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 1 });
  if (open.data[0]?.url) return json({ url: open.data[0].url });
  // One session per organization/window prevents parallel duplicate subscriptions.
  const session = await stripe.checkout.sessions.create({
    customer: customerId, mode: "subscription", line_items: [{ price: priceId!, quantity: 1 }],
    billing_address_collection: "required", customer_update: { address: "auto", name: "auto" },
    success_url: `${env.BASE_URL}/app?billing=processing`, cancel_url: `${env.BASE_URL}/app?billing=canceled`,
    expires_at: Math.floor(Date.now() / 1000 / 1800) * 1800 + 3600,
  }, { idempotencyKey: `trackrank-checkout:${org}:${priceId}:${Math.floor(Date.now() / 1800000)}` });
  return json({ url: session.url });
  } finally {
    await exec(env, "DELETE FROM billing_checkout_locks WHERE org_id=? AND token=?", org, lockToken);
  }
}

export async function syncSubscription(env: Env, subscription: Stripe.Subscription, event: Stripe.Event) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const customer = await one<Row>(env, "SELECT * FROM billing_customers WHERE customer_id=?", customerId);
  if (!customer) return; // Never adopt arbitrary customer metadata as tenant ownership.
  if (customer.subscription_id && customer.subscription_id !== subscription.id && !["canceled", "incomplete_expired"].includes(String(customer.status)))
    throw new HttpError(409, "Conflicting subscription; operator reconciliation required");
  const item = subscription.items.data[0];
  const mapping = item && await one<Row>(env, "SELECT p.* FROM billing_prices b JOIN plan_versions p ON p.id=b.plan_version_id WHERE b.price_id=? AND b.livemode=?", item.price.id, Number(event.livemode));
  if (!mapping || subscription.items.data.length !== 1 || item.quantity !== 1 || item.price.unit_amount !== mapping.price_cents || item.price.currency !== mapping.currency)
    throw new HttpError(409, "Unrecognized subscription price; operator reconciliation required");
  // Batch is transactional. Event marker, subscription state and entitlement assignment succeed together.
  // Strictly older events cannot overwrite newer state. Each event retrieves CURRENT Stripe state.
  const guard = "NOT EXISTS(SELECT 1 FROM billing_events WHERE event_id=?) AND EXISTS(SELECT 1 FROM billing_customers WHERE org_id=? AND event_created<=?)";
  const args = [event.id, customer.org_id, event.created];
  const stmts = [];
  if (paidStatus(subscription.status)) stmts.push(env.DB.prepare(`UPDATE organization_plans SET plan_version_id=?,assigned_at=?,reason=? WHERE org_id=? AND ${guard}`).bind(mapping.id, now(), "Verified Stripe subscription", customer.org_id, ...args));
  stmts.push(env.DB.prepare(`UPDATE billing_customers SET subscription_id=?,status=?,price_id=?,current_period_end=?,cancel_at_period_end=?,event_created=?,updated_at=? WHERE org_id=? AND ${guard}`).bind(subscription.id, subscription.status, item.price.id, item.current_period_end * 1000, Number(subscription.cancel_at_period_end), event.created, now(), customer.org_id, ...args));
  stmts.push(env.DB.prepare("INSERT OR IGNORE INTO billing_events VALUES(?,?,?)").bind(event.id, event.type, now()));
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
  if (subscriptionId) await syncSubscription(env, await stripe.subscriptions.retrieve(subscriptionId), event);
  return json({ received: true });
}
