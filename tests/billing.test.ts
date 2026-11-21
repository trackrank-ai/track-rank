import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Stripe from 'stripe';
import { syncSubscription, stripeWebhook, billingRoute } from '../src/server/billing';
import { organizationPlan } from '../src/server/plans';
import { fixture } from "./helpers/billing-fixture";

const sub=(status='active',price='price_test')=>({id:'sub_test',customer:'cus_test',status,cancel_at_period_end:false,items:{data:[{quantity:1,current_period_end:2000000000,price:{id:price,unit_amount:1000,currency:'usd'}}]}} as unknown as Stripe.Subscription);
const event=(id='evt_1',created=100)=>({id,created,type:'customer.subscription.updated',livemode:false} as Stripe.Event);
test('subscription activates exact revision, deduplicates, rejects stale events, suspends and recovers',async()=>{
 const {sql,env}=fixture();
 await syncSubscription(env,sub(),event());
 assert.equal((await organizationPlan(env,'org')).version,'starter-v1');
 await syncSubscription(env,sub('canceled'),event());
 assert.equal((await organizationPlan(env,'org')).version,'starter-v1');
 await syncSubscription(env,sub('past_due'),event('evt_2',200));
 await assert.rejects(organizationPlan(env,'org'),/Subscription payment required/);
 await syncSubscription(env,sub(),event('evt_old',150));
 await assert.rejects(organizationPlan(env,'org'),/Subscription payment required/);
 await syncSubscription(env,sub(),event('evt_3',300));
 assert.equal((await organizationPlan(env,'org')).version,'starter-v1');
 await syncSubscription(env,sub('canceled'),event('evt_4',400));
 await assert.rejects(organizationPlan(env,'org'),/Subscription payment required/);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM plan_assignment_history').get()!.n,2);
});
test('unknown prices and conflicting subscription cannot grant access',async()=>{
 const {sql,env}=fixture();
 await assert.rejects(syncSubscription(env,sub('active','price_unknown'),event()),/Unrecognized/);
 assert.equal((await organizationPlan(env,'org')).version,'beta-v1');
 assert.equal(sql.prepare('SELECT count(*) AS n FROM billing_events').get()!.n,0);
 await syncSubscription(env,sub(),event());
 await assert.rejects(syncSubscription(env,{...sub(),id:'sub_other'},event('evt_other',200)),/Conflicting/);
});
test('billing management survives suspension but rejects API keys and non-owner writes',async()=>{
 const {env}=fixture();
 await syncSubscription(env,sub(),event());
 await syncSubscription(env,sub('past_due'),event('evt_2',200));
 const p={userId:'alice',orgId:'org',role:'owner'};
 const response=await billingRoute(new Request('https://example.test'),env,p,'/billing');
 assert.equal(((await response.json()) as any).status,'past_due');
 await assert.rejects(billingRoute(new Request('https://example.test',{method:'POST'}),env,{...p,role:'member'},'/billing/checkout'),/owner/);
 await assert.rejects(billingRoute(new Request('https://example.test'),env,{...p,keyId:'key'},'/billing'),/Sign in/);
});
test('webhook verifies raw signature, timestamp and test/live environment before accepting',async()=>{
 const {env}=fixture();
 const stripe=new Stripe('sk_test_fixture');
 const payload=JSON.stringify({...event(),data:{object:{}},type:'unhandled'});
 const sign=(p:string,t?:number)=>stripe.webhooks.generateTestHeaderString({payload:p,secret:'whsec_fixture',timestamp:t});
 const req=(p:string,s:string)=>new Request('https://example.test/api/billing/webhook',{method:'POST',body:p,headers:{'stripe-signature':s}});
 assert.equal((await stripeWebhook(req(payload,sign(payload)),env)).status,200);
 await assert.rejects(stripeWebhook(req(payload+' ',sign(payload)),env),/Invalid Stripe signature/);
 await assert.rejects(stripeWebhook(req(payload,sign(payload,1)),env),/Invalid Stripe signature/);
 const live=JSON.stringify({...JSON.parse(payload),livemode:true});
 await assert.rejects(stripeWebhook(req(live,sign(live)),env),/environment mismatch/);
});
test('sandbox: real checkout and portal creation through application routes', {skip:!process.env.TRACKRANK_STRIPE_SMOKE}, async()=>{
 const {env,sql}=fixture();
 const vars=Object.fromEntries(readFileSync('.dev.vars.stripe','utf8').trim().split('\n').map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}));
 Object.assign(env,vars,{BASE_URL:'http://localhost:3000'});
 sql.exec('DELETE FROM billing_customers; DELETE FROM billing_prices;');
 sql.prepare("INSERT INTO billing_prices VALUES(?,'starter-v1',0)").run(vars.STRIPE_STARTER_PRICE_ID);
 const p={userId:'alice',orgId:'org',role:'owner'};
 const req=new Request('http://localhost:3000/api/v1/billing/checkout',{method:'POST'});
 const checkout=await billingRoute(req,env,p,'/billing/checkout');
 const url=((await checkout.json()) as any).url;
 await import('node:fs').then(fs => fs.writeFileSync('.checkout-qa.local',url,{mode:0o600}));
 assert.ok(url.startsWith('https://checkout.stripe.com/'));
 const repeat=await billingRoute(req,env,p,'/billing/checkout');
 assert.equal(((await repeat.json()) as any).url,url);
 const portal=await billingRoute(req,env,p,'/billing/portal');
 assert.ok(((await portal.json()) as any).url.startsWith('https://billing.stripe.com/'));
 assert.equal((await organizationPlan(env,'org')).version,'beta-v1','Checkout creation never activates paid plan');
});

test('test subscriptions cannot grant live entitlements after switching environments',async()=>{
 const {env}=fixture();
 await syncSubscription(env,sub(),event());
 env.STRIPE_SECRET_KEY='sk_live_fixture';
 await assert.rejects(organizationPlan(env,'org'),/Subscription payment required/);
});

test('trial access, once-per-org trial consumption, pending onboarding and stale-state suspension',async()=>{
 const {env,sql}=fixture();
 await syncSubscription(env,sub('trialing'),event());
 assert.equal((await organizationPlan(env,'org')).version,'starter-v1');
 assert.equal(sql.prepare("SELECT trial_used FROM billing_customers WHERE org_id='org'").get()!.trial_used,1);
 sql.exec("UPDATE billing_customers SET updated_at=0 WHERE org_id='org'");
 await assert.rejects(organizationPlan(env,'org'),/Subscription payment required/);
 const {defaultPlanVersion}=await import('../src/server/plans');
 assert.equal(await defaultPlanVersion(env),'pending-v1');
 delete env.BILLING_ENABLED;
 assert.equal(await defaultPlanVersion(env),'beta-v1');
});

test('risk events use Charge → PaymentIntent → Invoice Payment → Subscription, hold only mapped tenant',async()=>{
 const {env,sql}=fixture();
 const {riskEvent}=await import('../src/server/billing');
 let traversed=false;
 const stripe={charges:{retrieve:async()=>({id:'ch_risk',payment_intent:'pi_risk'})},invoicePayments:{list:async(args:any)=>{assert.equal(args.payment.payment_intent,'pi_risk');traversed=true;return{has_more:false,data:[{invoice:'in_risk'}]}}},invoices:{retrieve:async()=>({id:'in_risk',parent:{subscription_details:{subscription:'sub_test'}}})},subscriptions:{retrieve:async()=>sub()}} as unknown as Stripe;
 const risk={...event('evt_risk'),type:'charge.dispute.created',data:{object:{id:'dp_risk',charge:'ch_risk'}}} as unknown as Stripe.Event;
 await riskEvent(env,stripe,risk);
 assert.ok(traversed);
 assert.equal(sql.prepare("SELECT risk_hold FROM billing_customers WHERE org_id='org'").get()!.risk_hold,1);
 await syncSubscription(env,sub(),event('evt_after',200));
 await assert.rejects(organizationPlan(env,'org'),/Subscription payment required/,'later active webhook must not clear risk hold');
 await riskEvent(env,stripe,risk);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM billing_alerts').get()!.n,1);
 sql.exec('UPDATE billing_customers SET risk_hold=0');
 await riskEvent(env,stripe,{...risk,id:'evt_refund',type:'charge.refunded',data:{object:{id:'ch_risk',payment_intent:'pi_risk'}}} as Stripe.Event);
 assert.equal(sql.prepare("SELECT risk_hold FROM billing_customers WHERE org_id='org'").get()!.risk_hold,0,'refunds get reviewed, do not silently cancel or hold');
 await riskEvent(env,stripe,{...risk,id:'evt_fraud',type:'radar.early_fraud_warning.created'} as Stripe.Event);
 assert.equal(sql.prepare("SELECT risk_hold FROM billing_customers WHERE org_id='org'").get()!.risk_hold,1);
});

test('paused checkout leaves portal and recovery status available',async()=>{
 const {env}=fixture();env.BILLING_CHECKOUT_ENABLED='false';
 const req=new Request('https://example.test',{method:'POST'});
 await assert.rejects(billingRoute(req,env,{userId:'alice',orgId:'org',role:'owner'},'/billing/checkout'),/temporarily paused/);
 assert.equal((await billingRoute(new Request('https://example.test'),env,{userId:'alice',orgId:'org',role:'owner'},'/billing')).status,200);
});

test('live checkout requires a documented tax review', async () => {
 const { env } = fixture();
 env.STRIPE_SECRET_KEY = 'sk_live_fixture';
 const principal = { userId: 'alice', orgId: 'org', role: 'owner' };
 const getState = async () => (await billingRoute(new Request('https://example.test'), env, principal, '/billing')).json() as Promise<{ checkout_enabled: boolean }>;
 const checkout = () => billingRoute(new Request('https://example.test', { method: 'POST' }), env, principal, '/billing/checkout');

 assert.equal((await getState()).checkout_enabled, false);
 await assert.rejects(checkout(), /temporarily paused/);

 env.BILLING_TAX_REVIEWED = 'true';
 assert.equal((await getState()).checkout_enabled, true);
 await assert.rejects(checkout(), /Starter billing price is not configured/);
});

test('expired sync lease cannot commit status, entitlement or event marker',async()=>{
 const {env,sql}=fixture();
 sql.prepare('INSERT INTO billing_sync_locks VALUES(?,?,?)').run('cus_test','expired',0);
 await syncSubscription(env,sub(),event(),{customerId:'cus_test',token:'expired'});
 assert.equal((await organizationPlan(env,'org')).version,'beta-v1');
 assert.equal(sql.prepare('SELECT count(*) AS n FROM billing_events').get()!.n,0);
});

test('alert delivery retries failures, deduplicates acknowledged alerts and excludes customer payload',async()=>{
 const {env,sql}=fixture();
 const {billingAlert,deliverBillingAlerts}=await import('../src/server/billing');
 await billingAlert(env,'alert_test','org','test_failure','sub_test','Inspect billing');
 env.BILLING_ALERT_EMAIL='operator@example.test';env.RESEND_API_KEY='test-only';env.EMAIL_FROM='staging@example.test';
 const original=globalThis.fetch;
 try {
 globalThis.fetch=async(_input,init)=>{assert.ok(String(init?.body).includes('sub_test'));return new Response('',{status:503})};
 await assert.rejects(deliverBillingAlerts(env),/notification failed/);
 assert.equal(sql.prepare('SELECT notified_at FROM billing_alerts').get()!.notified_at,null);
 let calls=0;
 globalThis.fetch=async(_input,init)=>{calls++;assert.equal((init?.headers as any)['Idempotency-Key'],'trackrank-billing-alert_test');return new Response('{}',{status:200})};
 await deliverBillingAlerts(env);await deliverBillingAlerts(env);
 assert.equal(calls,1);
 } finally {globalThis.fetch=original;}
});
