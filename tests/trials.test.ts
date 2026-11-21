import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './helpers/billing-fixture';import {startTrial,trialDuration} from '../src/server/trials';import {organizationPlan} from '../src/server/plans';import {billingRoute,syncSubscription} from '../src/server/billing';import type Stripe from 'stripe';
function setup(){const f=fixture();f.env.HOSTED_FREE_TRIAL_ENABLED='true';f.env.BASE_URL='https://test.example';f.env.STRIPE_STARTER_PRICE_ID='price_test';f.sql.exec("INSERT INTO user VALUES('owner','Owner','owner@example.invalid',1,NULL,0,0);UPDATE organization_plans SET plan_version_id='pending-v1'");return f;}
test('verified account starts full Starter-equivalent trial without contacting Stripe; repeats do not extend it',async()=>{
 const {env,sql}=setup();const first=await startTrial(env,'owner','org');assert.equal(Number(first.ends_at)-Number(first.started_at),trialDuration);assert.deepEqual((await organizationPlan(env,'org')).limits,(await import('../src/server/plans')).planLimits.parse(JSON.parse(String(sql.prepare("SELECT limits_json FROM plan_versions WHERE id='starter-v1'").get()?.limits_json))));
 assert.deepEqual(await startTrial(env,'owner','org'),first);assert.equal(sql.prepare('SELECT count(*) AS n FROM account_trial_claims').get()?.n,1);
 const state=await (await billingRoute(new Request('https://test.example'),env,{userId:'owner',orgId:'org',role:'owner'},'/billing')).json() as any;assert.equal(state.access_status,'free_trial');assert.equal(state.free_trial.ends_at,first.ends_at);
});
test('unverified account and repeated trials across organizations fail closed',async()=>{
 const {env,sql}=setup();sql.exec("UPDATE user SET emailVerified=0");await assert.rejects(startTrial(env,'owner','org'),/Verify your email/);assert.equal(sql.prepare('SELECT count(*) AS n FROM organization_trials').get()?.n,0);sql.exec("UPDATE user SET emailVerified=1");await startTrial(env,'owner','org');sql.exec("INSERT INTO organizations(id,name,created_at) VALUES('second','Second',0);INSERT INTO organization_plans VALUES('second','pending-v1',0,'test')");await assert.rejects(startTrial(env,'owner','second'),/already been used/);
});
test('expired trial rejects product access but leaves plan/payment management available; paid webhook restores access',async()=>{
 const {env,sql}=setup();await startTrial(env,'owner','org');sql.exec("UPDATE organization_trials SET started_at=1,ends_at=2");await assert.rejects(organizationPlan(env,'org'),(e:any)=>e.status===402);
 const p={userId:'owner',orgId:'org',role:'owner'};const state=await(await billingRoute(new Request('https://test.example'),env,p,'/billing')).json() as any;assert.equal(state.access_status,'trial_expired');await startTrial(env,'owner','org');await assert.rejects(organizationPlan(env,'org'),/trial has ended/);
 const sub={id:'sub_paid',customer:'cus_test',status:'active',cancel_at_period_end:false,items:{data:[{quantity:1,current_period_end:2000000000,price:{id:'price_test',unit_amount:1000,currency:'usd'}}]}} as unknown as Stripe.Subscription;
 await syncSubscription(env,sub,{id:'evt_paid',created:100,type:'customer.subscription.updated',livemode:false} as Stripe.Event);assert.equal((await organizationPlan(env,'org')).version,'starter-v1');
});
test('paid upgrade Checkout has no second trial and requires immediate payment, not a new trial window',async()=>{
 const {env}=setup();await startTrial(env,'owner','org');let checkoutBody:URLSearchParams|undefined;const old=globalThis.fetch;
 globalThis.fetch=async(input:any,init:any)=>{const url=new URL(typeof input==='string'?input:input.url||String(input));let data:unknown;
 if(url.pathname==='/v1/prices/price_test')data={id:'price_test',active:true,unit_amount:1000,currency:'usd',recurring:{interval:'month',interval_count:1}};
 else if(url.pathname==='/v1/subscriptions')data={data:[],has_more:false};
 else if(url.pathname==='/v1/checkout/sessions' && init?.method==='POST'){checkoutBody=new URLSearchParams(String(init.body));data={id:'cs_paid',url:'https://checkout.stripe.com/paid'};}
 else if(url.pathname==='/v1/checkout/sessions')data={data:[],has_more:false};else throw Error('Unexpected Stripe request '+url.pathname);
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try{const r=await billingRoute(new Request('https://test.example',{method:'POST'}),env,{userId:'owner',orgId:'org',role:'owner'},'/billing/checkout');assert.equal(r.status,200);assert.ok(checkoutBody);assert.equal(checkoutBody!.get('subscription_data[trial_period_days]'),null);assert.equal(checkoutBody!.get('payment_method_collection'),'always');assert.equal(checkoutBody!.get('metadata[trackrank_checkout_revision]'),'paid-after-trial-v3');assert.equal((await organizationPlan(env,'org')).version,'trial-v1','creating checkout is not proof of payment');}finally{globalThis.fetch=old;}
});
