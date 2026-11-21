import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './helpers/billing-fixture';import {trialDuration} from '../src/server/trials';import {api} from '../src/server/api';import type {Ctx,Env} from '../src/server/types';import {organizationPlan} from '../src/server/plans';import {billingRoute,syncSubscription} from '../src/server/billing';import type Stripe from 'stripe';
function setup(){const f=fixture();f.env.BASE_URL='https://test.example';f.sql.exec("INSERT INTO user VALUES('owner','Owner','owner@example.invalid',1,NULL,0,0);UPDATE organization_plans SET plan_version_id='pending-v1';INSERT INTO billing_offers VALUES('starter-monthly',0,'price_test')");return f;}
function create(env: Env, name?: string) {
 return api(new Request(`https://test.example/api/v1/${name ? 'organizations' : 'onboarding/trial'}`, {
  method: 'POST', body: JSON.stringify(name ? { name } : {}),
 }), env, {} as Ctx, { userId: 'owner' });
}
async function onboard(env: Env) {
 return (await (await create(env)).json() as { id: string }).id;
}
test('onboarding and named creation share one card-free trial under concurrent requests', async () => {
 const { env, sql } = setup();
 sql.exec("UPDATE user SET emailVerified=0");
 await assert.rejects(create(env, 'Named'), /Verify your email/);
 await assert.rejects(create(env), /Verify your email/);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM organizations').get()?.n, 1);
 sql.exec("UPDATE user SET emailVerified=1");

 const [named, trialOrg] = await Promise.all([create(env, 'Named').then(r => r.json() as Promise<{ id: string }>), onboard(env)]);
 const trial = sql.prepare('SELECT * FROM organization_trials').get()!;
 assert.equal(trial.org_id, trialOrg);
 assert.equal(Number(trial.ends_at) - Number(trial.started_at), trialDuration);
 assert.equal(await onboard(env), trialOrg);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM account_trial_claims').get()?.n, 1);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM billing_customers').get()?.n, 1);
 assert.equal((await organizationPlan(env, trialOrg)).limits.runs_per_month, 6000);
 const next = await create(env, 'Another').then(r => r.json() as Promise<{ id: string }>);
 assert.notEqual(next.id, named.id);
 await assert.rejects(organizationPlan(env, next.id), /Choose a plan/);
});
test('expired trial rejects product access but leaves billing available until an active subscription', async () => {
 const { env, sql } = setup();
 const org = await onboard(env);
 sql.prepare("UPDATE billing_customers SET org_id=?").run(org);
 sql.exec("UPDATE organization_trials SET started_at=1,ends_at=2");
 await assert.rejects(organizationPlan(env, org), (error: any) => error.status === 402);
 const principal = { userId: 'owner', orgId: org, role: 'owner' };
 const state = await (await billingRoute(new Request('https://test.example'), env, principal, '/billing')).json() as { access_status: string };
 assert.equal(state.access_status, 'trial_expired');
 assert.equal(await onboard(env), org);
 await assert.rejects(organizationPlan(env, org), /trial has ended/);
 const sub = { id: 'sub_paid', customer: 'cus_test', status: 'active', cancel_at_period_end: false, items: { data: [{ quantity: 1, current_period_end: 2000000000, price: { id: 'price_test', unit_amount: 1000, currency: 'usd' } }] } } as unknown as Stripe.Subscription;
 await syncSubscription(env, sub, { id: 'evt_paid', created: 100, type: 'customer.subscription.updated', livemode: false } as Stripe.Event);
 assert.equal((await organizationPlan(env, org)).version, 'starter-v1');
});
test('paid upgrade Checkout charges immediately and returns to the same organization billing settings', async (t) => {
 const { env, sql } = setup();
 const org = await onboard(env);
 sql.prepare("UPDATE billing_customers SET org_id=?").run(org);
 let checkoutBody: URLSearchParams | undefined;
 t.mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
  const { pathname } = new URL(input);
  if (pathname === '/v1/prices/price_test') return Response.json({ id: 'price_test', active: true, livemode: false, unit_amount: 1000, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } });
  if (pathname === '/v1/checkout/sessions' && init?.method === 'POST') {
   checkoutBody = new URLSearchParams(String(init.body));
   return Response.json({ id: 'cs_paid', url: 'https://checkout.stripe.com/paid' });
  }
  if (pathname === '/v1/subscriptions' || pathname === '/v1/checkout/sessions') return Response.json({ data: [], has_more: false });
  throw Error(`Unexpected Stripe request ${pathname}`);
 });
 const request = new Request('https://test.example', { method: 'POST', body: JSON.stringify({ offer_key: 'starter-monthly' }) });
 const response = await billingRoute(request, env, { userId: 'owner', orgId: org, role: 'owner' }, '/billing/checkout');
 assert.equal(response.status, 200);
 assert.ok(checkoutBody);
 assert.equal(checkoutBody.get('subscription_data[trial_period_days]'), null);
 assert.equal(checkoutBody.get('payment_method_collection'), 'always');
 assert.equal(checkoutBody.get('success_url'), `https://test.example/app?org=${org}&tab=settings`);
 assert.equal(checkoutBody.get('cancel_url'), checkoutBody.get('success_url'));
 assert.equal((await organizationPlan(env, org)).version, 'trial-v1');
});

test('live checkout uses automatic tax and checks actual Stripe registration status', async (t) => {
 const { env, sql } = setup();
 env.STRIPE_SECRET_KEY = 'sk_live_fixture';
 sql.exec("INSERT INTO billing_prices VALUES('price_live','starter-v1',1);INSERT INTO billing_offers VALUES('starter-monthly',1,'price_live')");
 let registered = false;
 let checkoutUsesTax = false;
 t.mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
  const path = new URL(input).pathname;
  if (path === '/v1/prices/price_live') return Response.json({ livemode: true, active: true, unit_amount: 1000, currency: 'usd', recurring: { interval: 'month', interval_count: 1 }, tax_behavior: 'exclusive', product: 'prod_test' });
  if (path === '/v1/tax/settings') return Response.json({ status: 'active' });
  if (path === '/v1/tax/registrations') return Response.json({ data: registered ? [{ id: 'taxreg_test' }] : [] });
  if (path === '/v1/products/prod_test') return Response.json({ tax_code: 'txcd_test' });
  if (path === '/v1/checkout/sessions' && init?.method === 'POST') {
   checkoutUsesTax = new URLSearchParams(String(init.body)).get('automatic_tax[enabled]') === 'true';
   return Response.json({ url: 'https://checkout.stripe.com/test' });
  }
  if (path === '/v1/subscriptions' || path === '/v1/checkout/sessions') return Response.json({ data: [], has_more: false });
  throw Error(`Unexpected Stripe request ${path}`);
 });
 const checkout = () => billingRoute(new Request('https://test.example', { method: 'POST', body: JSON.stringify({ offer_key: 'starter-monthly' }) }), env, { userId: 'owner', orgId: 'org', role: 'owner' }, '/billing/checkout');
 await assert.rejects(checkout(), /Tax configuration requires verified registrations/);
 registered = true;
 assert.equal((await checkout()).status, 200);
 assert.equal(checkoutUsesTax, true);
});
