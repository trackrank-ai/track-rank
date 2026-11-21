# Versioned plans and entitlements

## Ownership and configuration

- **D1 plan catalog:** each immutable revision owns its name, price, currency, interval and allowances. Versions can be added/activated/retired without rebuilding the app. Repository migrations and JSON examples make changes reviewable.
- **D1 organization assignment:** pins an organization to an exact revision, never to a floating `starter` family alias. Retirement does not change its price or entitlements. Assignment changes are recorded by database triggers in `plan_assignment_history`.
- **Deployment variables:** `DEFAULT_PLAN_VERSION` chooses the revision for new local and self-hosted organizations. Hosted billing starts with the 14-day trial or awaits a subscription if the account has already used its trial. Optional `API_REQUESTS_PER_MINUTE` and `PROVIDER_REQUESTS_PER_MINUTE` are emergency ceilings, applied as `min(plan allowance, ceiling)`; they cannot upgrade anyone. Changing these ceilings affects existing organizations too, so do not use them for normal pricing changes.
- **Run usage:** the monthly run allowance governs admission. Daily tracking counts remain available for reporting.

No service subscription or external licensing check is required for self-hosting. Self-hosters control their catalog and can create a $0 plan with their own allowances. Limits are resource protections, not software licensing restrictions.

Hosted checkout uses `billing_offers` for the offers currently on sale and
`billing_prices` for immutable Stripe Price-to-revision mappings. Offer keys can
point to a new Price for future purchases. Withdrawing an offer leaves its Price
mapping available for renewals and reconciliation. See [billing operations](BILLING-OPERATIONS.md#publish-and-withdraw-offers).

## Supported revisions

| Revision | State | USD/month | API/min | Provider requests/min per budget | Checks/month | Searchable days |
|---|---|---:|---:|---:|---:|---:|
| beta-v1 (local/self-hosted) | active | $0 | 120 | 10 | 1,000,000 | unrestricted |
| starter-v2 | active | $10 | 120 | 10 | 10,000 | 30 |
| agency-v1 | active | $39 | 120 | 10 | 60,000 | 90 |
| scale-v1 | active | $99 | 120 | 10 | 250,000 | 180 |
| trial-v2 | active | $0 | 120 | 10 | 10,000 | 30 |

The prelaunch cutover retires the unused starter-v1/pro-v1/trial-v1 revisions.
Historical migrations remain ordered SQL, not supported runtime compatibility paths.
Hosted signup starts the 14-day no-card trial; local/self-hosted signup uses beta.

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

A deliberate upgrade/downgrade changes the assignment; it does NOT reset monthly usage. If the new allowance is below consumed usage, new work is blocked until rollover or a higher allowance is assigned. Already admitted runs keep their identities and count toward usage. New submissions use the currently assigned provider rate.

CLI assignment records the plan terms. Hosted paid access requires a verified
active Stripe subscription mapped to that revision. Billing webhooks and
reconciliation enforce payment failures and cancellation. Automated plan changes
and proration are separate work.


## What enforcement means

- API minute budgets are shared across REST, MCP tool calls, keys and organization members. Authorized attempts reaching the handler count, including operations that later fail validation.
- MCP discovery and initialization have a separate per-minute transport budget. Tool execution also uses the shared API allowance.
- Run, refresh, and analyze use the shared API allowance. DataForSEO submissions have two separate request budgets with the same plan rate, one for Standard/Priority and one for Live. Manual and scheduled work share those budgets. A Standard/Priority request can include up to 100 runs for a single engine. A Live request contains one run.
- Manual and scheduled runs share the UTC monthly allowance. Admission is atomic and its ledger survives result deletion. Replays reuse the original run identity. Each admitted failed or uncertain run counts once.
- Calendar months are UTC, **not subscription anniversary months**. Usage is organization-scoped, not per plan revision, so changing plans cannot reset it. Account-level routes without a selected organization remain on their separate user-based rate budget.
- Settings/MCP `get_context` return the assigned revision, allowances and monthly usage. Emergency ceilings can be lower than the displayed contracted allowances; keep them temporary and disclose material restrictions.

## Deliberately not implemented

An operator web console, customer-scheduled plan changes, automatic result expiry, and provider spending guarantees are separate work. Apply migration `0011` before deploying the admission ledger. It seeds this month's usage and preserves existing replay keys. Future expiry must keep these keys and counters until organization erasure or an explicit accounting-retention change. Once automatic expiry is enabled, roll back only to code that reads the durable counters.

## Three-tier revisions

Migration `0021` adds Starter `starter-v2` ($10, 10,000 checks, 30-day searchable history), Agency `agency-v1` ($39, 60,000 checks, 90 days), and Scale `scale-v1` ($99, 250,000 checks, 180 days). All retain 120 API operations/minute and 10 provider requests/minute per budget. Check allowances reset by UTC calendar month. `searchable_history_days` is optional for legacy/self-hosted revisions; absence preserves unrestricted history. Windows use run creation time, are enforced server-side for lists/research/CSV across REST and MCP, and do not delete stored evidence or change direct run access. The prelaunch billing-account migration cuts trial assignments to trial-v2 without resetting trial dates. Stripe mappings are immutable; Starter v2 therefore uses a new $10 Price under the existing Starter Product. See `stripe-tier-catalog.json` for live identifiers.

Migration0022 retires the unused starter-v1/pro-v1/trial-v1 catalog entries; the supported hosted catalog is Starter v2, Agency v1, Scale v1 and Trial v2. No legacy adapter is needed. Commercial revisions are distinct from organization roles and billing administrator grants.
