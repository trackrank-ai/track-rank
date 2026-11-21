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

- Public privacy, terms, support and security pages; footer/signup/app links; security.txt disclosure contact. Operator: Track Rank Ai; contact: info@trackrank.ai. See [operations](OPERATIONS.md) for the manual support/incident process and remaining retention/recovery work. Inbox delivery and legal review are not certified by the app checks.

## Verified in development

- 17 meaningful core/guard tests: tenant-bound authenticated encryption, matching/normalization, Google organic-vs-AI separation, scheduling/timezones, SQL/API tenant isolation, viewer/scoped-key enforcement, revocation/membership removal, invitation single-use, idempotency/daily cap, async task correlation/raw persistence, uncertain-submit non-retry, credential redaction, workspace brand isolation, and provider concurrency admission.
- Real local Worker HTTP checks: Better Auth password login/session/logout, D1 organization/default workspace, brand/prompt persistence, clean-SERP default, schedule timing edit, API key, MCP initialize/tools/list/get_context, scope enforcement, revocation and CSV response.
- No paid DataForSEO or OpenRouter calls and no real emails were sent by automated tests.

## Hosted smoke checks

Deployed to https://trackrank.ai (Worker version d49369e4-dd3b-47a9-a3b3-c3bdc4f15998). Homepage, login/setup and login assets return 200; anonymous organization/MCP access returns 401. Google authorization initiation returns accounts.google.com with callback https://trackrank.ai/api/auth/callback/google. Invalid-account password login returns 401 rather than a server failure. Runtime availability flags confirm Google/email configured and signup enabled; active-version metadata confirms D1, R2, Workflow, Google/Resend, auth and encryption bindings.

Rendered desktop/mobile homepage and login inspected; login has no horizontal overflow and no browser errors. shadcn preview tabs change content. Authenticated workspace operations were HTTP-tested locally; the real signed-in hosted browser UI still needs user acceptance. No real emails or paid provider requests were sent during these smoke tests.

## User acceptance still required before broader beta

1. Google consent flow with the actual configured Cloud client and an authorized test user; verify callback and sign-out.
2. Confirm the Resend sending domain is verified, then create an account, click its verification email, and exercise password reset. Current DNS indicates the sending subdomain is `mail.trackrank.ai`; sender is `login@mail.trackrank.ai`.
3. Create an organization, enter your own DataForSEO API credentials, and run **one** capped sample on each supported engine. Verify final provider costs, callback/poll completion and raw/parsed consistency.
4. Configure optional OpenRouter key/model and run one explicit analysis. Its spend is separate.
5. Invite a second real account as viewer/member; test acceptance, tenant switching and key revocation through the actual UI.
6. Enable one schedule at a near-future local time, observe one workflow execution, then pause it.

## Public paid launch gates, not completed

- Provider-dollar budget reservations/reconciliation; no claim that a run-count cap guarantees dollars.
- Billing and subscription lifecycle; final policy/business review, monitored inbox delivery, and verified operator recovery process. Public beta privacy/terms pages and support instructions are now implemented.
- Encryption-key rotation migration and restore drill; stable keys must be retained securely. Never replace CREDENTIALS_KEY casually.
- Representative multi-tenant/load/failure testing, operational alerting, D1/R2 retention and full deletion controls.
- Separate staging environment before routine production changes.

## Not required for hosted launch

Docker/self-hosting and portable storage/execution adapters are a separate distribution roadmap, not Cloudflare hosted launch blockers. A small free invited beta does not require Stripe.

## Hosted rollout order

1. Complete real-account authentication/email, second-account invitation, all provider engines and one scheduled workflow acceptance checks above.
2. Invite a small free beta cohort with clear BYOK/provider-cost and beta-limit disclosures. No seat or agent-key caps; this does not remove API rate, run-count or provider concurrency limits.
3. Before paid access: publish pricing, integrate checkout/customer portal and verified idempotent subscription webhooks, enforce organization entitlements server-side, test cancellation/payment failure. Publish terms/privacy and a support contact.
4. Verify recoverable D1/R2 backups with stable encryption keys, add failure/queue alerts, test representative tenant/load/failure cases and define retention/deletion. Dollar budgeting is required if promising a dollar spending cap; existing run caps are not monetary budgets.

The app can be used as an early hosted beta after authentication/provider acceptance checks. Do not describe it as fully production-hardened or billing-ready.
