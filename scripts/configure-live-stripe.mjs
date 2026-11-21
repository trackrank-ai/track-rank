// Gateway execution only: protected Stripe credential stays in HTTPS egress.
import fs from 'node:fs';
const key=process.env.STRIPE_LIVE_SECRET_KEY;
if(!key)throw Error('Protected live Stripe key is not available');
const version='2026-11-18.endive';
async function stripe(path,method='GET',data,idempotency){
 const body=data?new URLSearchParams(data):undefined;
 const r=await fetch('https://api.stripe.com/v1'+path,{method,headers:{Authorization:'Bearer '+key,'Stripe-Version':version,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotency?{'Idempotency-Key':idempotency}:{})},body});
 const d=await r.json();if(!r.ok)throw Error(`Stripe ${method} ${path}: HTTP${r.status} ${d.error?.type||''} ${d.error?.code||''} parameter=${d.error?.param||''}`);return d;
}
const account=await stripe('/account');
if(account.business_profile?.name!=='trackrank.ai'||!account.charges_enabled)throw Error('Merchant identity or charges eligibility mismatch');
const product=await stripe('/products','POST',{name:'TrackRank Starter',description:'14-day card-required trial, then $10/month before tax per organization','metadata[plan_version]':'starter-v1'},'trackrank-live-starter-v1-product');
const price=await stripe('/prices','POST',{product:product.id,currency:'usd',unit_amount:'1000','recurring[interval]':'month',tax_behavior:'exclusive','metadata[plan_version]':'starter-v1'},'trackrank-live-starter-v1-price');
if(!product.livemode||!price.livemode)throw Error('Expected LIVE catalog');
const portal=await stripe('/billing_portal/configurations','POST',{'business_profile[headline]':'Manage your TrackRank subscription','business_profile[privacy_policy_url]':'https://trackrank.ai/privacy','business_profile[terms_of_service_url]':'https://trackrank.ai/terms','features[invoice_history][enabled]':'true','features[payment_method_update][enabled]':'true','features[subscription_cancel][enabled]':'true','features[subscription_cancel][mode]':'at_period_end'},'trackrank-live-starter-v1-portal');
const secretFile='.live-billing-secrets.local';
let secrets=fs.existsSync(secretFile)?JSON.parse(fs.readFileSync(secretFile,'utf8')):{};
const events=['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed','invoice.paid','invoice.payment_failed','checkout.session.completed','checkout.session.async_payment_succeeded','charge.refunded','charge.dispute.created','radar.early_fraud_warning.created'];
let endpoint;
if(!secrets.STRIPE_WEBHOOK_SECRET){
 const data={url:'https://trackrank.ai/api/billing/webhook',api_version:version,description:'TrackRank production subscriptions'};
 events.forEach((e,i)=>data[`enabled_events[${i}]`]=e);
 endpoint=await stripe('/webhook_endpoints','POST',data,'trackrank-live-webhook-v1');
 secrets.STRIPE_WEBHOOK_SECRET=endpoint.secret;
 fs.writeFileSync(secretFile,JSON.stringify(secrets),{mode:0o600});
} else {
 const endpoints=await stripe('/webhook_endpoints?limit=100');endpoint=endpoints.data.find(e=>e.url==='https://trackrank.ai/api/billing/webhook');
}
const accountId='029c862aca4d53677446bd4004b732f4';
for(const [name,text] of [['STRIPE_SECRET_KEY',key],['STRIPE_WEBHOOK_SECRET',secrets.STRIPE_WEBHOOK_SECRET]]){
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/trackrank-ai/secrets`,{method:'PUT',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({name,text,type:'secret_text'})});const d=await r.json();if(!d.success)throw Error(`Cloudflare secret configuration failed for ${name}`);
}
const catalog={configured_at:new Date().toISOString(),account_id:account.id,livemode:true,product_id:product.id,price_id:price.id,portal_configuration:portal.id,webhook_endpoint_id:endpoint.id,charges_enabled:account.charges_enabled,payouts_enabled:account.payouts_enabled,automatic_tax:false};
fs.writeFileSync('docs/stripe-live.json',JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify(catalog));
console.log('Live key sent directly from protected store to Stripe/Cloudflare. Webhook secret saved privately. No live customer, checkout, subscription or payment created.');
