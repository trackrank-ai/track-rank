# Versioned plans and entitlements

## Ownership and configuration

- **D1 plan catalog:** each immutable revision owns its name, price, currency, interval and allowances. Versions can be added/activated/retired without rebuilding the app. Repository migrations and JSON examples make changes reviewable.
- **D1 organization assignment:** pins an organization to an exact revision, never to a floating `starter` family alias. Retirement does not change its price or entitlements. Assignment changes are recorded by database triggers in `plan_assignment_history`.
- **Deployment variables:** `DEFAULT_PLAN_VERSION` chooses the revision for NEW organizations only. Optional `API_REQUESTS_PER_MINUTE` and `PROVIDER_REQUESTS_PER_MINUTE` are emergency ceilings, applied as `min(plan allowance, ceiling)`; they cannot upgrade anyone. Changing these ceilings affects existing organizations too, so do not use them for normal pricing changes.
- **Run usage:** the monthly run allowance governs admission. Daily tracking counts remain available for reporting.

No service subscription or external licensing check is required for self-hosting. Self-hosters control their catalog and can create a $0 plan with their own allowances. Limits are resource protections, not software licensing restrictions.

## Initial revisions

| Revision | State | Price metadata | API/min | API/month | Provider ops/min | Runs/month | Concurrent runs |
|---|---|---|---:|---:|---:|---:|---:|
| beta-v1 | active | $0/month | 120 | 1,000,000,000 | 10 | 1,000,000 | 3 |
| starter-v1 | draft | $10/month | 120 | 200,000 | 10 | 6,000 | 3 |
| pro-v1 | draft | $30/month | 360 | 600,000 | 30 | 18,000 | 9 |

Migration `0004` assigns pre-existing organizations to Beta. Starter and Pro are draft templates. Pro's values are illustrative and must be reviewed before activation. The default remains Beta until the operator changes it.

## Operator commands

Apply migrations first (`npm run setup:local` locally; see self-hosting guide for remote migrations). Stop/restart local dev across schema upgrades.

The CLI **prints SQL by default**. Add `--apply` to execute locally. Remote execution requires both `--apply --remote` and an explicit `--config` so it cannot accidentally use hosted resources. Use the same local configuration/state as the app. Do not run remote operations before reviewing the printed SQL.

```sh
npm run plans -- list --apply
# Inspect and customize this JSON; its $15 price is only an example.
npm run plans -- create docs/plans/starter-v2.example.json
npm run plans -- create docs/plans/starter-v2.example.json --apply
npm run plans -- activate starter-v2 --apply
# Explicit immediate assignment; usage is NOT reset.
npm run plans -- assign ORGANIZATION_ID starter-v2 'Operator-approved upgrade' --apply
npm run plans -- retire starter-v1 --apply
```

For your own Cloudflare account append `--remote --config wrangler.selfhost.json`; the hosted operator uses `--remote --config wrangler.jsonc`. D1 migrations must be applied to the same database before deploying this code. Read CLI output: activating/retiring an unknown ID returns no rows, not a successful lifecycle change.

Set `DEFAULT_PLAN_VERSION=starter-v2` in your Cloudflare variables or local `.dev.vars` to assign future organizations to it. This does not migrate existing organizations. A missing/draft/retired default fails new organization creation; existing assigned retired versions remain usable.

## Price increases and retirement

Example: keep `starter-v1` at $10, introduce `starter-v2` at $15. Create/activate v2, make it the new signup default, retire v1 for new assignments, and leave v1 customers grandfathered. Database triggers reject edits/deletions of revision terms, even for drafts; fix a draft by creating a new revision. Never change a previously released migration to revise a live offer.

Price and limit changes both require a new revision. The public family can remain `starter` so the brand stays the same. Keep old revisions forever for history/support. Retirement means “not available to new assignments,” not “turn existing customers off.”

A deliberate upgrade/downgrade changes the assignment; it does NOT reset monthly usage. If the new allowance is below consumed usage, new work is blocked until rollover or a higher allowance is assigned. Already queued/submitted runs are not retroactively charged another allowance, deleted, or canceled; lower concurrency prevents additional submissions until active work falls below it.

The CLI assignment is immediate and is not a billing event. When billing is integrated, store immutable Stripe Price -> plan-version mappings, verify webhook signatures, process event IDs idempotently, and assign only from trusted subscription state. Schedule decreases/price increases for a clearly communicated renewal boundary as appropriate. Do not expose assignment changes as a customer-writable Settings field. Deferred effective dates, proration, payment failure handling and automated renewal migrations are not implemented yet.

Stripe similarly separates products from prices and restricts modifying used prices: https://support.stripe.com/questions/how-to-create-products-and-prices

## What enforcement means

- API minute and calendar-month budgets are shared across REST, MCP tool calls, keys and organization members. Authorized attempts reaching the handler count, including operations that later fail validation. Minute-limit rejections do not increment monthly usage. Monthly exhausted counters stop increasing.
- MCP protocol discovery/initialize traffic has a separate per-minute transport budget. Tool execution additionally consumes the shared API allowance; it is not counted twice in monthly API operations.
- Provider-operation rate includes POST `run`, `refresh`, `analyze`. All manual and scheduled run creation shares the monthly run allowance. Idempotent replay returns the original run without consuming another run. Failed/uncertain admitted runs count, preventing unlimited retry workload.
- Run admission uses an atomic conditional INSERT. Database triggers record the accepted key and increment UTC day and month counters in the same transaction. History removal cannot reopen quota or allow a replay to queue replacement work. Concurrency uses an atomic conditional UPDATE, and API monthly accounting uses an atomic upsert. These counters are shared across Worker instances.
- Calendar months are UTC, **not subscription anniversary months**. Usage is organization-scoped, not per plan revision, so changing plans cannot reset it. Account-level routes without a selected organization remain on their separate user-based rate budget.
- Settings/MCP `get_context` return the assigned revision, allowances and monthly usage. Emergency ceilings can be lower than the displayed contracted allowances; keep them temporary and disclose material restrictions.

## Deliberately not implemented

An operator web console, customer-scheduled plan changes, automatic result expiry, and provider spending guarantees are separate work. Apply migration `0011` before deploying the admission ledger. It seeds this month's usage and preserves existing replay keys. Future expiry must keep these keys and counters until organization erasure or an explicit accounting-retention change. Once automatic expiry is enabled, roll back only to code that reads the durable counters.
