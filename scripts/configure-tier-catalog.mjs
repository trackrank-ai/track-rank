// Gateway-only live catalog preparation. Does not publish offers or charge anyone.
import fs from 'node:fs';
import Stripe from 'stripe';
const apply = process.argv.includes('--apply');
const key = process.env.STRIPE_LIVE_SECRET_KEY;
if (!key) throw Error('Provide STRIPE_LIVE_SECRET_KEY through the protected Gateway environment');
const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
const account = await stripe.accounts.retrieveCurrent();
if (account.business_profile?.name !== 'trackrank.ai' || account.id !== 'acct_1Ue3pgG7SA9cWOCT') throw Error('Wrong Stripe account');
const tiers = [
  {name:'Starter',revision:'starter-v2',cents:1000,checks:10000,history:30},
  {name:'Agency',revision:'agency-v1',cents:3900,checks:60000,history:90},
  {name:'Scale',revision:'scale-v1',cents:9900,checks:250000,history:180},
];
const products = await stripe.products.list({limit:100}).autoPagingToArray({limit:1000});
const prices = await stripe.prices.list({limit:100}).autoPagingToArray({limit:1000});
const settings = await stripe.tax.settings.retrieve();
const taxCode = settings.defaults?.tax_code;
if (!taxCode) throw Error('No existing account tax classification; review before creating products');
const catalog=[];
for (const tier of tiers) {
  const matches=products.filter(p=>p.active && p.name === `TrackRank ${tier.name}`);
  if(matches.length>1) throw Error(`Ambiguous products for ${tier.name}`);
  let product=matches[0];
  const metadata={plan_version:tier.revision,checks_per_month:String(tier.checks),searchable_history_days:String(tier.history)};
  if (!product && apply) product=await stripe.products.create({name:`TrackRank ${tier.name}`,description:`${tier.checks.toLocaleString('en-US')} checks/month; ${tier.history} days searchable history`,tax_code:taxCode,metadata},{idempotencyKey:`trackrank-${tier.revision}-product`});
  const candidates=prices.filter(p=>p.active && p.product===product?.id && p.metadata.plan_version===tier.revision);
  if(candidates.length>1)throw Error(`Ambiguous prices for ${tier.revision}`);
  let price=candidates[0];
  if(price && (price.unit_amount!==tier.cents || price.currency!=='usd' || price.recurring?.interval!=='month' || price.recurring?.interval_count!==1 || price.tax_behavior!=='exclusive' || !price.livemode))throw Error('Existing price terms mismatch');
  if(!price && apply)price=await stripe.prices.create({product:product.id,unit_amount:tier.cents,currency:'usd',recurring:{interval:'month'},tax_behavior:'exclusive',metadata},{idempotencyKey:`trackrank-${tier.revision}-monthly-price`});
  catalog.push({...tier,product_id:product?.id??null,price_id:price?.id??null});
}
const result={account_id:account.id,livemode:true,offers_published:false,tiers:catalog};
if(apply)fs.writeFileSync('docs/stripe-tier-catalog.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
