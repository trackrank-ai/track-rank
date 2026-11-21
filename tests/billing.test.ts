import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import Stripe from 'stripe';
import { syncSubscription, stripeWebhook, billingRoute } from '../src/server/billing';
import { organizationPlan } from '../src/server/plans';
import type { Env } from '../src/server/types';
function fixture() {
 const sql = new DatabaseSync(':memory:');
 for (const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort()) sql.exec(readFileSync('migrations/'+f,'utf8'));
 sql.exec(`INSERT INTO organizations(id,name,created_at) VALUES('org','Test',0);
 INSERT INTO organization_plans VALUES('org','beta-v1',0,'fixture');
 INSERT INTO billing_customers(org_id,customer_id,updated_at) VALUES('org','cus_test',0);
 INSERT INTO billing_prices VALUES('price_test','starter-v1',0);`);
 const prepare=(query:string,args:any[]=[])=>({bind:(...a:any[])=>prepare(query,a), first:async()=>sql.prepare(query).get(...args)||null,run:async()=>sql.prepare(query).run(...args)});
 const env={DB:{prepare,batch:async(stmts:any[])=>{sql.exec('BEGIN');try {const result=[];for(const s of stmts)result.push(await s.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}},BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture'} as unknown as Env;
 return {sql,env};
}
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
