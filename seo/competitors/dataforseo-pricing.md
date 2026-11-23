# DataForSEO collection pricing research

Checked 2026-11-23. Sources:

- https://dataforseo.com/pricing/ai-optimization/llm-scraper
- https://dataforseo.com/pricing/google-serp/google-organic-serp-api
- https://docs.dataforseo.com/v3/serp/google/organic/task_post/
- https://dataforseo.com/pricing

ChatGPT/Gemini LLM Scraper published rates per result: Standard $0.0012; Priority $0.0024; Live $0.004. These are not the distinct LLM Responses or LLM Mentions products.

Google Organic published base rates per 10-result SERP: Standard $0.0006; Priority $0.0012; Live $0.002. The pricing table lists an additional base charge each for async AI Overview loading and poisoned-result resolution. Budgeting both produces three times the base rate. Task docs explain that unused async-overview charges are refunded and that resolving poisoned results adds one SERP-page price. This is a planning budget for the configured parameters, not actual invoice accounting. Advanced operators, greater depth, optional analysis and tax are excluded. Parameter-specific docs may describe surcharges differently; obtain an account-specific quote for contractual guarantees.

TrackRank's Google payload uses depth 10, async overview loading and the organization's poisoned-result setting (default on). The public calculator explicitly budgets both extras, without changing execution settings. Single-engine ChatGPT/Gemini profiles use LLM Scraper rates directly. Mixed profile averages the three engine costs, rather than applying ChatGPT's rate to Google.

50 questions, daily, 30 days: 1,500 results per selected engine. ChatGPT-only collection is $1.80 / $3.60 / $6.00 by mode. The modeled three-engine collection budget is $6.30 / $12.60 / $21.00. Add the live TrackRank subscription if hosted; self-hosting adds infrastructure instead. No claims of equal coverage/features or guaranteed savings versus competitor bundles.

DataForSEO's $50 minimum top-up is prepaid non-expiring credit, not a monthly subscription or monthly usage minimum. Initial cash required can exceed the month's consumption. Old $0.01 blended estimates were arbitrary assumptions; researched presets now replace that default. A custom blended rate remains available and is labeled as a user assumption.

## Dollar-first article budgets

The articles now show hosted total budgets before quotas. For three engines, one daily sample per engine, a 30-day month and a 30-day required history window:

| Questions | Monthly runs | Selected hosting | Standard total | Priority total | Live total |
|---|---:|---|---:|---:|---:|
| 16 | 1,440 | Starter $10 | $12.02 | $14.03 | $16.72 |
| 50 | 4,500 | Starter $10 | $16.30 | $22.60 | $31.00 |
| 120 | 10,800 | Agency $39 | $54.12 | $69.24 | $89.40 |
| 150 | 13,500 | Agency $39 | $57.90 | $76.80 | $102.00 |
| 350 | 31,500 | Agency $39 | $83.10 | $127.20 | $186.00 |
| 403 | 36,270 | Agency $39 | $89.78 | $140.56 | $208.26 |

Hosted prices come from the live catalog at render time, not this documentation table. `src/lib/comparison-cost.ts` applies each mode's per-engine rates and selects the tier satisfying volume and history. Ranges mean Standard queue to Live for the named workload, not arbitrary unlimited usage. They budget the configured Google extras before conditional refunds; actual bills can be lower. Taxes, optional inference, search operators, higher depth and additional samples are excluded. Software is free for self-hosting, but provider and infrastructure expenses remain separate; no fabricated all-in self-hosting range is published.

Ahrefs index and Profound enterprise prices are not directly comparable to collecting the named question set. Profound's public custom pricing supplies no verifiable numeric range; the article says so instead of inventing one. Otterly examples retain EUR and four-engine coverage; TrackRank examples use USD and three engines. The Standard/Priority/Live budget is not a feature-equivalence claim.
