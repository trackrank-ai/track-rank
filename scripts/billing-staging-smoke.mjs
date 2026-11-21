import fs from 'node:fs';
import assert from 'node:assert/strict';
const base='https://trackrank-staging.edninodel.workers.dev';
const path='.billing-staging-fixture.local';
const fixture=JSON.parse(fs.readFileSync(path,'utf8'));
let cookie='';
async function request(path,method='GET',body){const r=await fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(`${method} ${path}: ${r.status} ${JSON.stringify(data)}`);if(path.includes('sign-in'))cookie=r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');return data;}
await request('/api/auth/sign-in/email','POST',{email:fixture.email,password:fixture.password});
if(!fixture.org){const org=await request('/api/v1/organizations','POST',{name:'Stripe acceptance — staging only'});fixture.org=org.id;fs.writeFileSync(path,JSON.stringify(fixture),{mode:0o600});}
const suffix='?org='+fixture.org;
const billing=await request('/api/v1/billing'+suffix);assert.ok(['free_trial','trial_expired','choose_plan'].includes(billing.access_status));
const offer=billing.offers.find(o=>o.offer_key==='starter-monthly');assert.ok(offer,'Publish the staging Starter offer first');
const checkout=await request('/api/v1/billing/checkout'+suffix,'POST',{offer_key:offer.offer_key});
const repeated=await request('/api/v1/billing/checkout'+suffix,'POST',{offer_key:offer.offer_key});assert.equal(checkout.url,repeated.url);
fs.writeFileSync('.staging-checkout.local',checkout.url,{mode:0o600});
fs.writeFileSync('.staging-cookie.local',cookie,{mode:0o600});
console.log('PASS: deployed staging login, unpaid organization, exact plan mapping, checkout creation and duplicate reuse. Private checkout saved for browser acceptance.');
