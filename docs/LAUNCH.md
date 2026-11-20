# Beta launch status

## Implemented

- Original shadcn/ui application; Google and verified email/password auth; reset flow.
- Organizations, roles, single-use invite links, default and brand-oriented workspaces.
- Organization brands/aliases; prompts with ChatGPT/Gemini/Google scraper settings, location, language, standard/priority/live.
- Encrypted provider settings; optional explicit OpenRouter analysis.
- Durable workflows, signed callbacks, polling recovery, timezone-aware schedules, paused by default.
- D1 normalized history and R2 raw payloads; answer/mention/citation evidence, grounding queries, organic SERPs, entity discovery, dated chart, paginated aggregation and CSV export.
- Scoped expiring/revocable API keys and working Streamable HTTP MCP tools.
- Three submitting/submitted tasks per organization; round-robin queue dispatch; conservative run-count guardrail and usage visibility.

## Verified in development

- 16 meaningful core tests: tenant-bound authenticated encryption, matching/normalization, Google organic-vs-AI separation, scheduling/timezones, SQL/API tenant isolation, viewer/scoped-key enforcement, revocation/membership removal, invitation single-use, idempotency/daily cap, async task correlation/raw persistence, uncertain-submit non-retry, credential redaction, workspace brand isolation, and provider concurrency admission.
- Real local Worker HTTP checks: Better Auth password login/session/logout, D1 organization/default workspace, brand/prompt persistence, clean-SERP default, schedule timing edit, API key, MCP initialize/tools/list/get_context, scope enforcement, revocation and CSV response.
- No paid DataForSEO or OpenRouter calls and no real emails were sent by automated tests.

## User acceptance still required before broader beta

1. Google consent flow with the actual configured Cloud client and an authorized test user; verify callback and sign-out.
2. Confirm the Resend sending domain is verified, then create an account, click its verification email, and exercise password reset. Current DNS indicates the sending subdomain is `mail.trackrank.ai`; sender is `login@mail.trackrank.ai`.
3. Create an organization, enter your own DataForSEO API credentials, and run **one** capped sample on each supported engine. Verify final provider costs, callback/poll completion and raw/parsed consistency.
4. Configure optional OpenRouter key/model and run one explicit analysis. Its spend is separate.
5. Invite a second real account as viewer/member; test acceptance, tenant switching and key revocation through the actual UI.
6. Enable one schedule at a near-future local time, observe one workflow execution, then pause it.

## Public paid launch gates, not completed

- Provider-dollar budget reservations/reconciliation; no claim that a run-count cap guarantees dollars.
- Billing, subscription lifecycle, privacy/terms and operator support/recovery process.
- Encryption-key rotation migration and restore drill; stable keys must be retained securely. Never replace CREDENTIALS_KEY casually.
- Representative multi-tenant/load/failure testing, operational alerting, D1/R2 retention and full deletion controls.
- Separate staging environment, production Docker/self-hosting package and portable storage/execution adapters.

The app can be used as an early hosted beta after authentication/provider acceptance checks. Do not describe it as fully production-hardened or billing-ready.
