# Unslop SEO pass: comparison pages

Applied the installed `unslop-seo` skill on 2026-11-23 to all ten competitor pages and both hubs. Verified TrackRank claims against PRODUCT.md, the public catalog, provider-pricing constants and existing source-backed competitor notes. No new competitor price or capability claims were introduced.

## Rendered page receipts

| Route | H2 count | Buyer-question H2s | Direct opening |
|---|---:|---:|---|
| `/vs` | 6 | 1 | TrackRank lets you modify MIT-licensed code and collect answers with your DataForSEO account. Use these guides to compare that approach with managed monitoring packages. |
| `/alternatives` | 6 | 1 | TrackRank lets you modify MIT-licensed code and collect answers with your DataForSEO account. Use these guides to compare that approach with managed monitoring packages. |
| `/vs/peec-ai` | 8 | 4 | Choose Peec AI for a managed daily-monitoring package with brand-perception and action workflows . Choose TrackRank to modify MIT-licensed code, bring your DataForSEO credentials or self-host. |
| `/vs/ahrefs` | 8 | 4 | Choose Ahrefs Brand Radar for search-backed discovery across an existing AI-answer index and the wider Ahrefs toolkit . Choose TrackRank to modify MIT-licensed code, bring your DataForSEO credentials or self-host. |
| `/vs/profound` | 8 | 4 | Choose Profound for enterprise governance, wider engine coverage and a dedicated support relationship . Choose TrackRank to modify MIT-licensed code, bring your DataForSEO credentials or self-host. |
| `/vs/promptwatch` | 8 | 4 | Choose Promptwatch for broader model coverage, agent chat and integrated content workflows . Choose TrackRank to modify MIT-licensed code, bring your DataForSEO credentials or self-host. |
| `/vs/otterly-ai` | 8 | 4 | Choose OtterlyAI for a small managed starting package or a workflow needing its broader engine selection . Choose TrackRank to modify MIT-licensed code, bring your DataForSEO credentials or self-host. |
| `/alternatives/peec-ai` | 9 | 5 | Choose TrackRank for MIT-licensed code, your DataForSEO credentials and self-hosting without a software subscription. Your question list is growing beyond a fixed prompt package, or you want to inspect and change the tracking code. |
| `/alternatives/ahrefs` | 9 | 5 | Choose TrackRank for MIT-licensed code, your DataForSEO credentials and self-hosting without a software subscription. You need to collect a known set of buyer questions in your own stack, rather than pay for a broad discovery index. |
| `/alternatives/profound` | 9 | 5 | Choose TrackRank for MIT-licensed code, your DataForSEO credentials and self-hosting without a software subscription. You want a focused monitoring stack with visible software costs, instead of procuring an enterprise marketing package. |
| `/alternatives/promptwatch` | 9 | 5 | Choose TrackRank for MIT-licensed code, your DataForSEO credentials and self-hosting without a software subscription. You need economical repeated monitoring and code-level control, without buying a broader content-operations platform. |
| `/alternatives/otterly-ai` | 9 | 5 | Choose TrackRank for MIT-licensed code, your DataForSEO credentials and self-hosting without a software subscription. You want to control collection spending directly, customize the application or separate hosting from usage as monitoring grows. |

## File receipts

### Unslop pass: `src/components/comparison-pages.tsx`

- **First 40 words:** head-to-head pages name each product's fit; alternatives and hubs link TrackRank in the opening paragraph.
- **Headings:** added direct-answer buyer questions about price, self-hosting and competitor fit; sentence case throughout. See rendered counts above.
- **Grounding:** replaced five generic TrackRank table strings with competitor-specific counterpart facts. Added verdicts to every alternative block. Removed the obsolete $0.01 contrast from the public example. Open `[NEEDS FACT]` markers: 0.
- **Slop:** removed 4 dash characters and 4 curly quote characters. Cut filler and split long copy in the shared renderer; no AI-vocabulary replacements were needed. Skill check script: **0 hits**.

### Unslop pass: `src/components/pricing-section.tsx`

- **First 40 words:** calculator states the 30-day estimate and keeps provider costs separate.
- **Headings:** existing sentence-case calculator headings retained.
- **Grounding:** published-rate presets and live catalog remain unchanged. Open `[NEEDS FACT]` markers: 0.
- **Slop:** removed 3 dash characters and 0 curly quote characters. Cut filler and split long copy in the shared renderer; no AI-vocabulary replacements were needed. Skill check script: **0 hits**.

### Unslop pass: `src/data/competitors.ts`

- **First 40 words:** supplies five competitor-specific reasons and alternatives headings for the shared renderers.
- **Headings:** five distinct alternative-page headings; product names retain their official capitalization.
- **Grounding:** 25 TrackRank counterpart facts now align with the competitor row. Preserved five cited competitor facts and three better-fit situations per competitor. Open `[NEEDS FACT]` markers: 0.
- **Slop:** removed 0 dash characters and 5 curly quote characters. Cut filler and split long copy in the shared renderer; no AI-vocabulary replacements were needed. Skill check script: **0 hits**.

### Unslop pass: `src/routes/vs.$competitor.tsx`

- **First 40 words:** page body delegates to the audited comparison renderer.
- **Headings:** metadata uses sentence case; no keyword, canonical or route changes.
- **Grounding:** retains the researched competitor record and live catalog loader. Open `[NEEDS FACT]` markers: 0.
- **Slop:** removed 0 dash characters and 0 curly quote characters. Cut filler and split long copy in the shared renderer; no AI-vocabulary replacements were needed. Skill check script: **0 hits**.

### Unslop pass: `src/routes/vs.index.tsx`

- **First 40 words:** page body delegates to the audited comparison renderer.
- **Headings:** metadata uses sentence case; no keyword, canonical or route changes.
- **Grounding:** retains the researched competitor record and live catalog loader. Open `[NEEDS FACT]` markers: 0.
- **Slop:** removed 1 dash characters and 0 curly quote characters. Cut filler and split long copy in the shared renderer; no AI-vocabulary replacements were needed. Skill check script: **0 hits**.

### Unslop pass: `src/routes/alternatives.$competitor.tsx`

- **First 40 words:** page body delegates to the audited comparison renderer.
- **Headings:** metadata uses sentence case; no keyword, canonical or route changes.
- **Grounding:** retains the researched competitor record and live catalog loader. Open `[NEEDS FACT]` markers: 0.
- **Slop:** removed 1 dash characters and 0 curly quote characters. Cut filler and split long copy in the shared renderer; no AI-vocabulary replacements were needed. Skill check script: **0 hits**.

### Unslop pass: `src/routes/alternatives.index.tsx`

- **First 40 words:** page body delegates to the audited comparison renderer.
- **Headings:** metadata uses sentence case; no keyword, canonical or route changes.
- **Grounding:** retains the researched competitor record and live catalog loader. Open `[NEEDS FACT]` markers: 0.
- **Slop:** removed 1 dash characters and 0 curly quote characters. Cut filler and split long copy in the shared renderer; no AI-vocabulary replacements were needed. Skill check script: **0 hits**.

## Verification

- Ran the skill's exact checker before and after: 19 flagged source lines before; 0 after. Mathematical subtraction remains arithmetic, formatted without prose-style dash spacing.
- Read through for passive wording, repeated labels, generic openings, long sentences and mismatched comparison dimensions.
- All 12 routes returned 200 and contain buyer-question headings; all five alternative-page openings link TrackRank. No visible fact placeholders.
- Desktop and mobile browser checks cover both shared page templates; the route audit supplies the first 40 words and heading counts for every page.
- Build, typecheck and existing regression suite results are recorded in the PR. No deployment.

## Dollar-first follow-up

- `src/components/comparison-pages.tsx`: monthly cost ranges now lead the opening callout, quota rows and TrackRank alternative blocks. The cost table shows Standard/Priority/Live totals, with hosting/provider breakdowns. Buyer-question H2s and first-paragraph recommendations remain intact.
- `src/data/competitors.ts`: price-related TrackRank rows now reference typed workloads rather than quota-only prose. Source-based competitor facts remain unchanged. Otterly workload examples retain four-engine EUR context beside three-engine USD TrackRank budgets.
- `src/lib/comparison-cost.ts`: a shared cost model selects the live hosting tier and derives all three mode budgets from the existing per-engine rates. Missing hosted catalog prices remain a quote, not zero dollars or an invented self-hosted price.
- Exact skill checker: 0 hits across these files. No new fact markers. Dollar assumptions, conditional Google refunds, excluded costs and the $50 prepaid top-up remain explicit.
- Browser: all ten articles at desktop/mobile widths (20 checks) using an isolated populated hosted-catalog fixture. No page overflow or JavaScript errors; each opening includes a monthly dollar range and the Peec 350-question row includes $83.10-$186.00/month. Evidence: `reports/seo-comparisons/dollar-first-check.json`.
