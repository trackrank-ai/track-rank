import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { estimatePricing, type PricedPlan } from '../src/lib/pricing-estimate';
import { trialDaysRemaining, TrialBanner } from '../src/components/trial-banner';
const plans: PricedPlan[] = [
  { name:'Starter', price_cents:1000, currency:'usd', interval:'month', limits:{runs_per_month:10000,searchable_history_days:30}},
  { name:'Agency', price_cents:3900, currency:'usd', interval:'month', limits:{runs_per_month:60000,searchable_history_days:90}},
  { name:'Scale', price_cents:9900, currency:'usd', interval:'month', limits:{runs_per_month:250000,searchable_history_days:180}},
];
test('calculator counts engine samples, includes providers and selects by both history and volume', () => {
  const starter=estimatePricing(plans,50,3,1,30,.01)!;
  assert.equal(starter.runs,4500); assert.equal(starter.total,55); assert.equal(starter.savings,40);
  assert.equal(estimatePricing(plans,50,3,1,90,.01)!.plan.name,'Agency');
  assert.equal(estimatePricing(plans,50,3,1,180,.01)!.plan.name,'Scale');
  assert.equal(estimatePricing(plans,50,3,3,30,.01)!.plan.name,'Agency');
  const beyond=estimatePricing(plans,1000,3,3,30,.01)!;
  assert.equal(beyond.plan,undefined); assert.equal(beyond.total,null); assert.equal(beyond.savings,null);
});
test('calculator never promises savings for more expensive or incomparable configurations', () => {
  assert.ok(estimatePricing(plans,50,3,1,30,1)!.savings! < 0);
  assert.equal(estimatePricing(plans,50,2,1,30,.01)!.alternative,undefined);
  assert.equal(estimatePricing(plans,50,3,2,30,.01)!.savings,null);
  assert.equal(estimatePricing(plans,351,3,1,30,.01)!.alternative,undefined);
  for (const value of [NaN,Infinity,-1,0,1.5]) assert.equal(estimatePricing(plans,value,3,1,30,.01),null);
  assert.equal(estimatePricing(plans,50,3,1,30,-1),null);
  assert.equal(estimatePricing(plans.filter(p=>p.currency==='eur'),50,3,1,30,.01)!.plan,undefined);
});
test('trial countdown rounds partial days up, clamps expiry and renders persistent Starter context', () => {
  assert.equal(trialDaysRemaining(86400001,0),2);
  assert.equal(trialDaysRemaining(86400000,0),1);
  assert.equal(trialDaysRemaining(0,1),0);
  const html=renderToStaticMarkup(createElement(TrialBanner,{endsAt:Date.now()+3600000,children:'Choose subscription'}));
  assert.match(html,/Starter plan/); assert.match(html,/1 day/); assert.match(html,/Purchase a subscription/);
  assert.match(html,/Choose subscription/); assert.doesNotMatch(html,/dismiss|close/i);
});
