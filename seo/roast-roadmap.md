# SEO Roast Roadmap: trackrank.ai (2026-11-23)

Verdict: You sell AI visibility, but your own discovery plumbing is unfinished—and two commercial pages cannot cover a market.

## Revenue-ordered actions

| # | Tier | Issue | Revenue impact | Fix / first action | Owner | Status |
|---|---|---|---|---|---|---|
| 1 | REVENUE | No dedicated search-intent pages beyond Home and Pricing | Buyers researching open-source tracking, self-hosting and agency workflows lack a focused landing page | Validate queries, then publish substantive /open-source-ai-visibility-tracker, /self-hosted-ai-visibility-tracking and /ai-visibility-tracking-for-agencies pages with actual setup, evidence and costs; link each from Home | founder/content | next; proposed URLs, not existing pages |
| 2 | REVENUE | /sitemap.xml returns 404 | No explicit sitemap discovery path for current or future commercial pages | Serve XML with only public routes and advertise it in robots.txt | agent | implemented in fix branch; not deployed |
| 3 | REVENUE | Home and Pricing lack canonicals; homepage title omits tracking category | Query variants lack an explicit preferred URL; title undersells product relevance | Deployment-aware self-canonicals and category-specific titles | agent | implemented in fix branch; not deployed |
| 4 | REVENUE | Prices are readable but have no SoftwareApplication/Offer markup | Machine consumers must infer product/offer relationships | Derive schema prices and limits from the same live offer catalog; disclose extra provider costs | agent | implemented in fix branch; not deployed |
| 5 | COMPOUNDING | No public outcome case study found in linked pages | Cold buyers see illustrative evidence, not demonstrated customer results | Publish a permissioned, reproducible before/after study once real observations exist; keep sample data labeled | founder | next; do not invent customers |
| 6 | COMPOUNDING | Authority and editorial link gap not measured | Cannot determine whether links or content currently constrain ranking | Obtain site + three SERP competitors' clean referring domains and ranking footprints before setting a numeric acquisition target | founder/SEO | unmeasured; no DR or link-count claims |
| 7 | REVENUE | Pricing has a homepage body link but three contextual incoming links were not established | Future informational traffic may fail to reach paid plans | Link naturally from the three proposed intent pages to Pricing, with a workload/cost explanation | content | dependent on row 1 |
| 8 | COMPOUNDING | AI recommendation presence not measured | No baseline for whether engines recommend TrackRank | Record dated answers for validated buyer prompts across the supported engines; compare after release | founder | not tested; do not infer absence from missing sitemap |

## Confirmed live evidence

Read-only HTTP inspection on 2026-11-23:

- https://trackrank.ai/ and https://trackrank.ai/pricing: 200, server-rendered descriptions and offer text; neither contains a canonical link.
- https://trackrank.ai/sitemap.xml: genuine 404, not XML.
- https://trackrank.ai/robots.txt: 200, explanatory content-signal comments only; no user-agent restriction, no Sitemap directive. This is NOT a default-deny robots policy. The branch makes access explicit. Cloudflare may prepend its own policy text; verify the edge result after release.
- https://trackrank.ai/no-such-page-roast-xyz: 404. No catch-all soft-404 failure found.
- GPTBot, OAI-SearchBot, PerplexityBot and ClaudeBot user-agent HTTP requests to Pricing: all returned 200 with $10, $39 and $99 in body text after removing head/scripts/styles. This tests these requests, not verified crawler IP access or actual engine citations.
- https://trackrank.ai/llms.txt: 404. Optional discovery aid, not an indexing requirement; deliberately lower priority than buyer pages.
- Home links directly to Pricing, exposes an illustrative recorded-answer example, and has a no-login interactive cost calculator. Not a demo-only wall.
- No public programmatic/locale routes found in current route tree; a 20-URL programmatic sample is not applicable.
- One web `site:trackrank.ai` query returned no results. Indexation is UNVERIFIED without Search Console; this does not establish deindexation.

## Boundaries and verification

No fatal crawl/render blocker was established on the inspected money pages. Missing sitemap alone does not prevent indexing. No revenue/traffic uplift forecast is justified from these checks.

PR scope: crawl discovery endpoints, money-page metadata, catalog-derived structured data and documentation only. No billing, tenant access or collection behavior changed; no migrations, paid calls or production deployment performed. No new public evidence sharing or product backlink badge: evidence currently requires membership, and an SEO task is not permission to expose it.

Local verification: existing suite 123 passed / 1 skipped; new discovery regression test passed; production build passed. Typecheck result is recorded in the PR. Desktop/mobile visual audit, SafeSearch comparison, GSC URL Inspection, verified-bot WAF behavior, Ahrefs/DataForSEO keyword/backlink metrics and actual AI recommendation tests are not completed. Do not report those as passes.

After merge/release:

```sh
curl -i https://trackrank.ai/sitemap.xml
curl -A Bingbot https://trackrank.ai/robots.txt
curl -A OAI-SearchBot https://trackrank.ai/pricing
curl -I https://trackrank.ai/no-such-page-roast-xyz
```

Confirm XML URLs resolve, view-source has absolute canonicals and matching offer schema, check the edge robots response, then submit the sitemap and inspect Home/Pricing in Search Console. Merge/release requires the repository's human CODEOWNER gate; no bypass.

## Fluff (ignore until the rows above ship)

- Optional llms.txt, social preview polish, minor alt/heading/meta-length cleanup; no speculative issue counts.

## Comparison expansion (same PR)

Added `/vs` and `/alternatives` hubs plus ten researched commercial pages for Peec AI, Ahrefs Brand Radar, Profound, Promptwatch and OtterlyAI. Every page is linked from the shared public/legal footer and included in the runtime sitemap. Pricing links contextually to `/vs/peec-ai`. This partially addresses row 1 with comparison intent; the original open-source/self-hosted/agency landing-page suggestions remain separate future work. Google research and dated sources are stored in `seo/competitors/`. Pages use ownership/BYOK/run-based economics as the reason to consider TrackRank without asserting universal savings, a free provider, unverified competitor shortcomings or automatic historical migration.

The initial $0.01/run planning assumption was replaced after checking official DataForSEO pricing. The default is now the Standard three-engine profile: 1,500 results per engine for 50 questions/day over 30 days, modeled collection budget $6.30 plus applicable hosting. ChatGPT-only collection is $1.80 Standard at that question count. Mode/profile-specific presets, surcharge/refund caveats and the separate $50 prepaid top-up are documented in `seo/competitors/dataforseo-pricing.md`; a custom blended-rate option remains labeled as an assumption.
