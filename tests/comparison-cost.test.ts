import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonCost } from '../src/lib/comparison-cost';
import type { PricedPlan } from '../src/lib/pricing-estimate';
const plans: PricedPlan[] = [
  {name:'Starter',price_cents:1000,currency:'usd',interval:'month',limits:{runs_per_month:10000,searchable_history_days:30}},
  {name:'Agency',price_cents:3900,currency:'usd',interval:'month',limits:{runs_per_month:60000,searchable_history_days:90}},
  {name:'Scale',price_cents:9900,currency:'usd',interval:'month',limits:{runs_per_month:250000,searchable_history_days:180}},
];
const close = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual-expected)<1e-8,`${actual} vs ${expected}`);
test('article ranges include hosting and all three execution-mode provider budgets', () => {
  for (const [questions,standard,priority,live] of [[16,12.016,14.032,16.72],[50,16.3,22.6,31],[120,54.12,69.24,89.4],[150,57.9,76.8,102],[350,83.1,127.2,186],[403,89.778,140.556,208.26]]) {
    const result=comparisonCost(plans,{questions});
    close(result.standard.total,standard);close(result.priority.total,priority);close(result.live.total,live);
  }
});
test('costs select hosting by both volume and requested history, without a false zero when unavailable', () => {
  assert.equal(comparisonCost(plans,{questions:50,historyDays:180}).standard.plan?.name,'Scale');
  assert.equal(comparisonCost(plans,{questions:111}).standard.plan?.name,'Starter');
  assert.equal(comparisonCost(plans,{questions:112}).standard.plan?.name,'Agency');
  const noCatalog=comparisonCost([],{questions:350});
  assert.equal(noCatalog.standard.total,null);close(noCatalog.standard.provider,44.1);
  const chatgpt=comparisonCost(plans,{questions:5,profile:'chatgpt'});
  close(chatgpt.standard.total,10.18);close(chatgpt.live.total,10.6);
});
