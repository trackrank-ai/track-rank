// Read-only deployment-owner preflight. Never accepts keys on the command line.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import Stripe from 'stripe';
import { unstable_readConfig } from 'wrangler';
const args=process.argv.slice(2).filter(arg=>arg!=='--post-payment');
const postPayment=process.argv.includes('--post-payment');
const candidateIndex=args.indexOf('--price');
const candidate=candidateIndex<0 ? null : args.splice(candidateIndex,2)[1];
if(candidateIndex>=0 && (!candidate || !/^price_[a-zA-Z0-9]{1,94}$/.test(candidate)))throw Error('Pass a valid Stripe Price ID to --price.');
const configPath=args.shift()||'wrangler.staging.json';
if(args.length)throw Error('Usage: npm run billing:preflight -- <worker-config> [--price <price_id>] [--post-payment]');
const config=unstable_readConfig({ config: configPath });
const key=process.env.STRIPE_LIVE_SECRET_KEY||process.env.STRIPE_SECRET_KEY;
if(!key)throw Error('Set STRIPE_SECRET_KEY through your deployment secret environment; do not put it in arguments or committed files.');
const stripe=new Stripe(key,{httpClient:Stripe.createFetchHttpClient()});
const expectedLive=!!process.env.STRIPE_LIVE_SECRET_KEY || !key.includes('_test_');
const origin=new URL(config.vars.BASE_URL).origin;
const results=[];
const check=(name,passed,detail='')=>{results.push({name,passed,detail});};
const test=!expectedLive;
const selection=candidate ? `b.price_id='${candidate}'` : 'EXISTS(SELECT 1 FROM billing_offers o WHERE o.price_id=b.price_id AND o.livemode=b.livemode)';
const sql=`SELECT b.price_id,p.id,p.price_cents,p.currency,p.interval FROM billing_prices b JOIN plan_versions p ON p.id=b.plan_version_id WHERE b.livemode=${Number(expectedLive)} AND p.status='active' AND p.price_cents>0 AND ${selection}`;
const [query]=JSON.parse(execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--remote','--config',configPath,'--command',sql,'--json'],{encoding:'utf8'}));
if(!query?.success)throw Error('Unable to read the billing catalog from the target D1 database.');
const mappedPrices=query.results;
if(!mappedPrices.length)throw Error('No eligible mapped Stripe Prices. Pass --price to verify a mapped candidate before publishing it.');
const automaticTax=false; // Explicit Checkout Studio configuration approved by deployment owner.
const tax=automaticTax ? await stripe.tax.settings.retrieve() : null;
const registrations=automaticTax ? await stripe.tax.registrations.list({status:'active',limit:100}) : null;
for(const mapping of mappedPrices){
 const price=await stripe.prices.retrieve(mapping.price_id,{expand:['product']});
 check(`Stripe Price matches ${mapping.id}`,price.active&&price.livemode===expectedLive&&price.unit_amount===mapping.price_cents&&price.currency===mapping.currency&&price.recurring?.interval===mapping.interval&&price.recurring?.interval_count===1,price.id);
 if(automaticTax){
  const product=price.product;
  check(`Automatic tax configured for ${mapping.id}`,tax?.status==='active'&&registrations.data.length>0&&price.tax_behavior==='exclusive'&&typeof product!=='string'&&!product.deleted&&!!product.tax_code,`Settings: ${tax?.status}; active registrations: ${registrations.data.length}.`);
 }
}
const portal=await stripe.billingPortal.configurations.retrieve(config.vars.STRIPE_PORTAL_CONFIGURATION);
check('Portal supports period-end cancellation, invoices and payment updates',portal.active&&portal.features.subscription_cancel.enabled&&portal.features.subscription_cancel.mode==='at_period_end'&&portal.features.invoice_history.enabled&&portal.features.payment_method_update.enabled);
const endpoints=await stripe.webhookEndpoints.list({limit:100});
const endpoint=endpoints.data.find(e=>e.url===origin+'/api/billing/webhook'&&e.status==='enabled');
check('Enabled webhook endpoint exists',Boolean(endpoint));
const required=['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed','checkout.session.completed','checkout.session.async_payment_succeeded','charge.refunded','charge.dispute.created','radar.early_fraud_warning.created'];
check('Webhook covers lifecycle and risk events',Boolean(endpoint&&required.every(e=>endpoint.enabled_events.includes(e)||endpoint.enabled_events.includes('*'))));
for(const path of ['/api/health','/pricing','/terms','/privacy']){const response=await fetch(origin+path);check(`Deployed ${path}`,response.status===200);}
if(!test){const account=await stripe.accounts.retrieveCurrent();check('Live charges enabled',account.charges_enabled);check('Live payouts enabled',account.payouts_enabled);}
check('Mode suitable for live launch',!test,test?'TEST key: sandbox verification only, cannot approve live charging':'Live key detected');
check('Operator alerts configured',Boolean(config.vars.BILLING_ALERT_EMAIL),'Requires a verified sender/Resend secret, recipient and a delivered notification drill.');
if(!test){
 const readEvidence=name=>{try{return JSON.parse(fs.readFileSync(new URL('../reports/billing-acceptance/'+name,import.meta.url),'utf8'));}catch{return null;}};
 const ops=readEvidence('production-operations.json');
 check('Production backup recovery verified',ops?.recovery?.independently_decrypted_canary===true && ops?.recovery?.r2_restore_canary_decrypted===true);
 check('Support and alert delivery verified',ops?.inbox_delivery?.support?.inbox_received===true && ops?.inbox_delivery?.alert?.inbox_received===true,'Provider acceptance is not proof of inbox receipt.');
 const journey=readEvidence('production-journey.json');
 const gates=['google_consent_and_callback','verification_and_reset_email','named_invitation_and_organization_switch','supported_engine_collections','scheduled_provider_run','authenticated_api_mcp_quotas'];
 check('Real-account production acceptance complete',!!journey && gates.every(k=>journey[k]===true),'Sandbox/staging lifecycle results do not certify the real production account journey.');
 if(postPayment)check('Live Starter payment and signed webhook verified',journey?.real_card_paid_upgrade_and_webhook===true);
}
const passed=results.every(r=>r.passed);
const safe={checked_at:new Date().toISOString(),environment:test?'test':'live',origin,phase:postPayment?'post-payment':'pre-enable',results,passed,ready_for_live:postPayment&&passed};
console.log(JSON.stringify(safe,null,2));
if(!passed)process.exitCode=2;
