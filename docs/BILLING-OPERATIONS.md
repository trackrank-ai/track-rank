# Billing operations and live cutover

## Confirmed commercial policy (Edwin, 2026-11-21)

USD10/month BEFORE tax per organization. One 14-day introductory trial per
organization; card required. Cancel before trial expiry to avoid first charge.
First PAID charge refundable on request within 7 days. Later refunds case by
case, preserving mandatory rights. DataForSEO/OpenRouter charges are separate.
Live automatic tax cannot be enabled before actual registration details are
confirmed. No invented registrations, head-office address or product tax code.

## Environments and deployment

- Production: `trackrank-ai`, https://trackrank.ai, existing D1/R2 and stable keys.
- Staging: `trackrank-staging`, https://trackrank-staging.edninodel.workers.dev,
  its own D1/R2/workflow, independent random AUTH_SECRET/CREDENTIALS_KEY and
  Stripe TEST keys/signing secret. Signup is closed. Temporary QA user exists
  only in staging. No production users/data copied.
- `TRACKRANK_CONFIG=wrangler.staging.json npm run build` then deploy
  `dist/server/wrangler.json`. Never use a stale staging build for production.
- Production build uses `npm run build`; check generated Worker name and DB ID
  before deploying. An automated guard must reject staging/live mismatches.

## Live cutover order — no live payment acceptance has been claimed

1. Run typecheck/tests/build and read the acceptance evidence.
2. Export/back up production D1 and preserve the existing encryption/auth secrets
   through the deployment-owner vault. Never replace CREDENTIALS_KEY to set up billing.
3. Apply migrations through 0007. The new pending plan does not affect existing
   tenants. `BILLING_ENFORCE_NEW_ORGS=true` only controls NEW hosted organizations.
4. Obtain live restricted credentials via the deployment's secret store; confirm
   Stripe account charges/payouts eligibility and required business details.
5. Create live Product/Price (USD1000 monthly, tax-exclusive) and portal (invoices,
   payment update and at-period-end cancellation). Confirm configured tax code
   and real registrations before enabling automatic tax. Set BILLING_TAX_REVIEWED=true
   only after reviewing actual obligations; if automatic tax is disabled, record
   why no collection is currently required. Absence of registrations alone is not
   evidence that collection is unnecessary. Test-mode IDs cannot be used.
6. Insert live Price → starter-v1 mapping with livemode=1. Configure live Price
   and portal IDs, live secret and unique production webhook signing secret.
7. Register production `/api/billing/webhook` for the lifecycle, checkout and risk
   events listed in BILLING.md at SDK API version 2026-11-18.endive.
8. Deploy with BILLING_ENABLED=true and BILLING_CHECKOUT_ENABLED=false; this keeps
   recovery, webhooks and reconciliation online while new enrollments are paused.
9. Set BILLING_ALERT_EMAIL to a monitored operator recipient and configure the
   existing verified email sender/Resend secret. Test delivery and retries with
   a benign billing alert. Do not send customer content, payment data or secrets.
10. Publish/verify pricing, terms and privacy. Checkout requires terms consent and
    links to this deployment's terms/privacy. Confirm support inbox receipt.
11. Run `node scripts/billing-preflight.mjs <live-config.json>` with secret injected
    by the deployment owner. It is read-only and reports blockers; test keys
    cannot pass live mode. Review actual tax obligations, not just API flags.
12. Enable new checkouts, perform an explicitly authorized real-card trial signup,
    verify card collection and signed webhook entitlements. A 14-day trial has no
    initial charge. Validate the first real paid invoice later; do not claim it
    occurred at trial signup. Cancel test enrollment before charging unless a
    real payment was explicitly authorized for verification.

## State recovery, concurrency and missed webhooks

Each customer synchronization acquires a token-owned two-minute D1 lease and
re-reads the CURRENT Stripe subscription only after acquiring it. Expired leases
cannot commit state or event markers. Short collisions are retried. Older events
cannot overwrite newer state; duplicates are transactional no-ops. A 5-minute
cron reconciles up to 10 customers per invocation (configurable 1–25), fairly
ordered by last attempt, including failures. Paid snapshots older than 24 hours
fail closed; billing management still works. At scale, size this batch/cron so
all customers reconcile well inside 24 hours. Alert on missed cron/delivery errors.
Stripe remains source of truth; API errors are not permission to grant access.

## Alerts and risk review

`billing_alerts` persists webhook/reconciliation failures and refund/dispute/fraud
cases. Stripe signatures are checked before processing; invalid signatures do not
spam operational alerts. Customers are mapped by stored Customer ID; Charge
risks follow PaymentIntent → Invoice Payment → Invoice → Subscription.

Disputes and early fraud warnings set `risk_hold=1`. Later active webhooks or
reconciliation do NOT clear this hold. Refunds create an operator-review record;
they do not silently cancel subscriptions. A full refund and cancellation are
separate actions in Stripe. Alerts use email idempotency and retry unacknowledged
delivery; without BILLING_ALERT_EMAIL/verified sender they are stored but NOT
emailed. This missing setup is a live launch blocker, not an implemented monitor.

Inspect through remote D1 (operator only):

```sql
SELECT id,org_id,kind,resource_id,summary,created_at,notified_at
FROM billing_alerts WHERE resolved_at IS NULL ORDER BY created_at;
```

After verifying the Stripe case, contacting the customer when appropriate and
reconciling state, record the support-case reason outside the SQL command. Only
an operator may release a hold; customers cannot self-release payment risk:

```sql
UPDATE billing_customers SET risk_hold=0 WHERE org_id='<verified org>';
UPDATE billing_alerts SET resolved_at=<current epoch milliseconds>
WHERE id='<reviewed alert>';
```

Do not clear holds blindly; refund/dispute evidence deadlines and lost charges
remain in Stripe Dashboard. Alert summaries contain identifiers, not card or
workspace content. Alert retention/resolution needs operational ownership.

## Refund procedure

Verify requester identity, organization authority, Stripe Customer ownership and
the first NONZERO paid invoice timestamp. Within 7 days of that first charge,
refund the charge in Stripe Dashboard and separately cancel future renewal if
requested. Keep the Stripe refund ID and support-case evidence. Do not refund
provider charges (not collected by TrackRank). The refund webhook should create
exactly one review record for the matching subscription. If payment was disputed,
follow Stripe's dispute process rather than independently issuing a duplicate refund.

## Rollback

Pause NEW checkout with BILLING_CHECKOUT_ENABLED=false; do not disable portal,
webhooks or reconciliation. Keep migrations/mappings/events and stable encryption
keys. Do not roll back to code that treats a plan assignment as proof of payment.
Reconcile all paid customers after recovery. Never restore a stale billing DB
snapshot without reconciling Stripe state and preserving events since the snapshot.

## Verified vs not verified

Read reports/billing-acceptance. Real test-card lifecycle, real Stripe-signed CLI
webhooks, trial expiry, failed renewal, recovery, refund and period-end cancellation
are exercised by `node --import tsx scripts/billing-lifecycle.ts` (TEST keys only).
The script cleans up its test clock/customer and never sends customer email.
Deployed staging Checkout and webhook browser verification is recorded separately.
Production funds, account activation, tax registration, operator email/inbox delivery,
real Google/email/provider acceptance and production backup restore remain separate
external/operational checks; this billing work does not certify those systems.

## Current staging acceptance

Browser-completed hosted Checkout required a test card and terms consent and
showed 14 days free then $10/month. Direct Stripe → staging webhook delivery
granted trialing Starter access. Authenticated browser app displayed the trial.
Then the test subscription was canceled; direct webhook enforcement returned
HTTP402 for paid settings/API while the billing portal still returned HTTP200.
No real funds, production user records or live subscription were involved.

Edwin confirmed November 21, 2026: TrackRank has no sales-tax registrations yet.
Automatic tax remains off; STRIPE_TAX_READY and BILLING_TAX_REVIEWED remain false.
No registrations were created. This fact alone does not establish that collection
is unnecessary; actual registration/collection obligations still need review
before live launch. Do not invent registrations or mark the tax preflight passed.
