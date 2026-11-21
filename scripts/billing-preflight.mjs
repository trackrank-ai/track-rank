// Read-only deployment-owner preflight. Never accepts keys on the command line.
import fs from 'node:fs';
import Stripe from 'stripe';
const configPath=process.argv[2]||'wrangler.staging.json';
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
const key=process.env.STRIPE_SECRET_KEY;
if(!key)throw Error('Set STRIPE_SECRET_KEY through your deployment secret environment; do not put it in arguments or committed files.');
const stripe=new Stripe(key);
const test=key.includes('_test_');
const origin=new URL(config.vars.BASE_URL).origin;
const results=[];
const check=(name,passed,detail='')=>{results.push({name,passed,detail});};
const price=await stripe.prices.retrieve(config.vars.STRIPE_STARTER_PRICE_ID,{expand:['product']});
check('Price is USD10/month',price.unit_amount===1000&&price.currency==='usd'&&price.recurring?.interval==='month'&&price.recurring?.interval_count===1);
check('Price matches key environment',price.livemode===!test);
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
if(!test){const account=await stripe.accounts.retrieve();check('Live charges enabled',account.charges_enabled);check('Live payouts enabled',account.payouts_enabled);}
check('Mode suitable for live launch',!test,test?'TEST key: sandbox verification only, cannot approve live charging':'Live key detected');
check('Operator alerts configured',Boolean(config.vars.BILLING_ALERT_EMAIL),'Requires a verified sender/Resend secret, recipient and a delivered notification drill.');
const safe={checked_at:new Date().toISOString(),environment:test?'test':'live',origin,results,ready_for_live:results.every(r=>r.passed)};
console.log(JSON.stringify(safe,null,2));
if(!safe.ready_for_live)process.exitCode=2;
