import test from 'node:test';
import assert from 'node:assert/strict';
import { competitors, competitorBySlug, comparisonPaths } from '../src/data/competitors';
import { discoveryResponse } from '../src/server/seo';
import { profilePricing, llmRates } from '../src/lib/provider-pricing';
import { estimatePricing } from '../src/lib/pricing-estimate';

test('comparison discovery contains only researched competitors and all public pages', async () => {
  assert.equal(competitors.length, 5);
  assert.equal(new Set(comparisonPaths).size, 12);
  assert.equal(competitorBySlug('not-real'), undefined);
  const sitemap = await discoveryResponse('/sitemap.xml', 'https://example.org')!.text();
  for (const item of competitors) {
    assert.ok(item.facts.length >= 5);
    assert.ok(item.wins.length >= 3);
    assert.ok(item.description.length >= 140 && item.description.length <= 160, item.slug);
    assert.ok(item.altDescription.length >= 140 && item.altDescription.length <= 160, item.slug);
    assert.ok(`TrackRank vs ${item.name}: Open source`.length <= 60);
    assert.ok(`${item.name} alternatives | TrackRank`.length <= 60);
    assert.match(item.url, /^https:\/\//);
    assert.ok(sitemap.includes(`https://example.org/vs/${item.slug}`));
    assert.ok(sitemap.includes(`https://example.org/alternatives/${item.slug}`));
  }
});

test('published workload arithmetic includes provider cost and respects catalog/history', () => {
  const plans = [
    { name: 'Starter', price_cents: 1000, currency: 'usd', interval: 'month', limits: { runs_per_month: 10000, searchable_history_days: 30 } },
    { name: 'Agency', price_cents: 3900, currency: 'usd', interval: 'month', limits: { runs_per_month: 60000, searchable_history_days: 90 } },
  ];
  for (const [prompts, runs, total] of [[50,4500,16.3],[150,13500,57.9],[350,31500,83.1]]) {
    const estimate = estimatePricing(plans,prompts,3,1,30,profilePricing("all","standard").perRun)!;
    assert.equal(estimate.runs,runs);
    assert.ok(Math.abs(estimate.total! - total) < 0.000001);
  }
  assert.equal(estimatePricing(plans,50,3,1,30,.05)!.savings! < 0, true);
  assert.equal(estimatePricing(plans,50,3,1,180,.01)!.plan, undefined);
  assert.equal(estimatePricing([],50,3,1,30,.01)!.total,null);
});

test('provider presets distinguish single engines, three-engine mix and execution modes', () => {
  assert.equal(profilePricing('chatgpt','standard').perRun,.0012);
  assert.equal(profilePricing('gemini','live').perRun,.004);
  assert.equal(profilePricing('google','standard').engines,1);
  assert.ok(Math.abs(profilePricing('all','standard').perQuestion-.0042) < 1e-10);
  assert.ok(Math.abs(profilePricing('all','priority').perQuestion-.0084) < 1e-10);
  assert.ok(Math.abs(profilePricing('all','live').perQuestion-.014) < 1e-10);
  assert.ok(Math.abs(1500 * llmRates.standard - 1.8) < 1e-10);
});
