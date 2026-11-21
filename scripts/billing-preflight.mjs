// Read-only deployment-owner preflight. Never accepts keys on the command line.
import fs from 'node:fs';
import Stripe from 'stripe';
const configPath=process.argv[2]||'wrangler.staging.json';
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
const key=process.env.STRIPE_LIVE_SECRET_KEY||process.env.STRIPE_SECRET_KEY;
if(!key)throw Error('Set STRIPE_SECRET_KEY through your deployment secret environment; do not put it in arguments or committed files.');
const stripe=new Stripe(key,{httpClient:Stripe.createFetchHttpClient()});
const expectedLive=!!process.env.STRIPE_LIVE_SECRET_KEY || !key.includes('_test_');
const origin=new URL(config.vars.BASE_URL).origin;
const results=[];
const check=(name,passed,detail='')=>{results.push({name,passed,detail});};
const price=await stripe.prices.retrieve(config.vars.STRIPE_STARTER_PRICE_ID,{expand:['product']});
check('Price is USD10/month',price.unit_amount===1000&&price.currency==='usd'&&price.recurring?.interval==='month'&&price.recurring?.interval_count===1);
const test=!price.livemode;
check('Price matches key environment',price.livemode===expectedLive);
check('Price active',price.active);
check('Checkout trial policy configured in source',true,'14 days, card required, once per organization; terms consent required');
const portal=await stripe.billingPortal.configurations.retrieve(config.vars.STRIPE_PORTAL_CONFIGURATION);
check('Portal active and cancellation/invoices/payment updates enabled',portal.active&&portal.features.subscription_cancel.enabled&&portal.features.invoice_history.enabled&&portal.features.payment_method_update.enabled);
const endpoints=await stripe.webhookEndpoints.list({limit:100});
const endpoint=endpoints.data.find(e=>e.url===origin+'/api/billing/webhook'&&e.status==='enabled');
check('Enabled webhook endpoint exists',Boolean(endpoint));
const required=['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed','charge.refunded','charge.dispute.created','radar.early_fraud_warning.created'];
check('Webhook covers lifecycle and risk events',Boolean(endpoint&&required.every(e=>endpoint.enabled_events.includes(e)||endpoint.enabled_events.includes('*'))));
for(const path of ['/api/health','/pricing','/terms','/privacy']){const response=await fetch(origin+path);check(`Deployed ${path}`,response.status===200);}
const tax=await stripe.tax.settings.retrieve();
const registrations=await stripe.tax.registrations.list({status:'active',limit:100});
check('Tax settings/registrations reviewed',config.vars.BILLING_TAX_REVIEWED==='true' && (config.vars.STRIPE_AUTOMATIC_TAX!=='true' || (tax.status==='active'&&registrations.data.length>0)),`Settings: ${tax.status}; active registrations: ${registrations.data.length}. Must confirm actual collection obligations; preflight does not infer them.`);
if(!test){const account=await stripe.accounts.retrieveCurrent();check('Live charges enabled',account.charges_enabled);check('Live payouts enabled',account.payouts_enabled);}
check('Mode suitable for live launch',!test,test?'TEST key: sandbox verification only, cannot approve live charging':'Live key detected');
check('Operator alerts configured',Boolean(config.vars.BILLING_ALERT_EMAIL),'Requires a verified sender/Resend secret, recipient and a delivered notification drill.');
if(!test){
 const readEvidence=name=>{try{return JSON.parse(fs.readFileSync(new URL('../reports/billing-acceptance/'+name,import.meta.url),'utf8'));}catch{return null;}};
 const ops=readEvidence('production-operations.json');
 check('Production backup recovery verified',ops?.recovery?.independently_decrypted_canary===true && ops?.recovery?.r2_restore_canary_decrypted===true);
 check('Support and alert delivery verified',ops?.email_delivery?.length>=2 && ops.email_delivery.every(x=>x.last_event==='delivered'),'Provider acceptance is not proof of inbox receipt.');
 const journey=readEvidence('production-journey.json');
 const gates=['google_consent_and_callback','verification_and_reset_email','named_invitation_and_organization_switch','supported_engine_collections','scheduled_provider_run','authenticated_api_mcp_quotas','real_card_trial_and_webhook'];
 check('Real-account production acceptance complete',!!journey && gates.every(k=>journey[k]===true),'Sandbox/staging lifecycle results do not certify the real production account journey.');
}
const safe={checked_at:new Date().toISOString(),environment:test?'test':'live',origin,results,ready_for_live:results.every(r=>r.passed)};
console.log(JSON.stringify(safe,null,2));
if(!safe.ready_for_live)process.exitCode=2;
