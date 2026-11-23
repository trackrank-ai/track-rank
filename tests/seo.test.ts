import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveryResponse } from '../src/server/seo';

test('discovery uses the installation origin and excludes private evidence', async () => {
  const sitemap = discoveryResponse('/sitemap.xml', 'https://selfhost.example');
  assert.equal(sitemap?.headers.get('Content-Type'), 'application/xml; charset=utf-8');
  const xml = await sitemap!.text();
  assert.match(xml, /<loc>https:\/\/selfhost.example\/pricing<\/loc>/);
  assert.doesNotMatch(xml, /trackrank.ai|\/app|\/api|\/login/);
  const robots = await discoveryResponse('/robots.txt', 'https://selfhost.example')!.text();
  assert.match(robots, /User-agent: \*\nAllow: \//);
  assert.match(robots, /Sitemap: https:\/\/selfhost.example\/sitemap.xml/);
  assert.equal(discoveryResponse('/not-a-real-page', 'https://selfhost.example'), null);
});
