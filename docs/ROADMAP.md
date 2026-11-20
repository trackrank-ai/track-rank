# Implementation roadmap

## Decisions

- Brand: TrackRank; domain: trackrank.ai.
- New independent codebase. Architectural inspiration is fine; do not fork OpenSEO.
- Private repository initially, intended for open-source release under MIT.
- MVP: AI response visibility tracking, not a full SEO suite.
- TanStack Start + React on Cloudflare Workers; D1 metadata, R2 large responses, Workflows/Cron execution planned.
- Customer-owned DataForSEO credentials. Managed subscriptions independent of provider spend.

## 1. First vertical slice

- Define provider-neutral prompt, engine configuration, answer, mention and citation contracts.
- Validate one real DataForSEO endpoint with an explicitly capped test budget.
- Normalize results and derive deterministic metrics; keep failed checks out of successful-answer denominators.
- Keep provider calls server-only; introduce durable run IDs and external task correlation.

## 2. Accounts and persistence

- Better Auth, organizations and roles, email verification/reset, organization-scoped projects and prompts.
- D1/Drizzle migrations and private R2 response storage.
- Authenticated server boundaries; tenant identifiers derived from verified membership.
- Encrypted per-organization credentials with key versions, rotation procedure and redacted logs.
- Prove tenant isolation in API, background jobs, object downloads and exports.

## 3. Scheduling and reporting

- Scheduled runs, durable retries and stale-job reconciliation.
- Idempotent submission/ingestion, bounded concurrency, fair scheduling, spend reservation and reconciliation.
- Validate callback capabilities for the selected endpoint before choosing callback versus polling execution.
- Show actual answers, citations, competitors, history and CSV export.
- Define mention matching, citation matching, sample counts and parser versions explicitly.

## 4. Self-hosting and managed beta

- Keep execution/storage interfaces small; deliver a tested local runtime and Docker instructions.
- Hosted signup/onboarding, transactional mail, subscription checkout and signed/idempotent payment webhooks.
- Pause paid schedules appropriately on cancellation; provide export and deletion.
- Separate staging/production resource sets, CI checks, resource budgets and failure monitoring.
- Mock-first load tests, budget-capped live tests, restore drill and small customer beta.

## Launch gate

Tenant isolation verified; key rotation and restore exercised; billing lifecycle checked; retry/recovery verified; costs measured; mobile and accessibility checks; no illustrative metrics presented as collected data.
