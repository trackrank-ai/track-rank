# Billing operations and live cutover

## Confirmed commercial policy (Edwin, 2026-11-21)

USD10/month BEFORE tax per organization. One 14-day introductory application trial
per verified account; no card required and no automatic charge. At expiry, access
pauses until an explicit paid upgrade succeeds. Existing agreements are unchanged.
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
3. Apply pending D1 migrations for the release using the explicit production
   configuration. Hosted billing enrolls eligible new organizations in the no-card trial.
   Keep the Worker in maintenance through migrations `0016` to `0018` and the
   matching deployment. These migrations remove schema used by older Workers.
4. Obtain live restricted credentials via the deployment's secret store; confirm
   Stripe account charges/payouts eligibility and required business details.
5. Create live Product/Price (USD 10 monthly, tax-exclusive) and portal (invoices,
   payment update and at-period-end cancellation). Document tax obligations and
   verify the product tax code and active registrations. Live Checkout always
   uses Stripe Tax. Use live Price and portal IDs.
6. Insert live Price → starter-v1 mapping with livemode=1. Configure the live
   portal ID, live secret and unique production webhook signing secret.
7. Register production `/api/billing/webhook` for the lifecycle, checkout and risk
   events listed in BILLING.md at SDK API version 2026-11-18.endive.
8. Deploy with hosted billing enabled and the live offer catalog empty. Apply
   migration `0015_billing_offers.sql` before deploying. Existing Stripe mappings,
   billing management and reconciliation remain available.
9. Set BILLING_ALERT_EMAIL to a monitored operator recipient and configure the
   existing verified email sender/Resend secret. Test delivery and retries with
   a benign billing alert. Do not send customer content, payment data or secrets.
10. Publish/verify pricing, terms and privacy. Checkout requires terms consent and
    links to this deployment's terms/privacy. Confirm support inbox receipt.
11. Map the candidate live Price from `stripe-live.json` to the plan revision in
    D1. Run `npm run billing:preflight -- wrangler.jsonc --price <price-id>` before
    publishing, with the live key injected by the deployment owner. Confirm tax
    obligations separately and record the production journey in `production-journey.json`.
12. Once the live gates are cleared, publish the offer and perform an explicitly
    authorized real-card purchase. Paid upgrade charges immediately: no second
    Stripe trial. Verify signed-webhook entitlements, invoice and cancellation.
    Record the result in `production-journey.json` and run
    `npm run billing:preflight -- wrangler.jsonc --post-payment` to verify the
    recorded payment acceptance.

### Publish and withdraw offers

The same commands work in staging with `test` and `wrangler.staging.json`. Take
the environment's Price ID from its Stripe catalog. Commands print SQL until
you pass `--apply`.

```sh
npm run plans -- price-map <price-id> starter-v1 live --apply --remote --config wrangler.jsonc
npm run billing:preflight -- wrangler.jsonc --price <price-id>
npm run plans -- offer-publish starter-monthly <price-id> live --apply --remote --config wrangler.jsonc
npm run plans -- offer-list --apply --remote --config wrangler.jsonc
```

The public pricing page and owner checkout list published offers for the Worker's
Stripe mode. Use a new Price ID and plan revision when changing terms. Point an
offer key at the new mapped Price after verification. Existing subscribers keep
the revision mapped to their original Price. Preflight without `--price` checks
published offers. Adding or withdrawing an offer requires no Worker redeploy.

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

Withdraw each live offer with `npm run plans -- offer-withdraw <offer-key> live
--apply --remote --config wrangler.jsonc` to pause new Checkout sessions. Expire
already-open Stripe Checkout sessions if they must also stop accepting payments.
Keep the portal, webhooks, reconciliation, migrations and mappings, and stable encryption
keys. Do not roll back to code that treats a plan assignment as proof of payment.
Reconcile all paid customers after recovery. Never restore a stale billing DB
snapshot without reconciling Stripe state and preserving events since the snapshot.

## Verified vs not verified

Read reports/billing-acceptance. Real test-card lifecycle, real Stripe-signed CLI
webhooks, immediate paid activation, failed renewal, recovery, refund and period-end
cancellation are exercised by `node --import tsx scripts/billing-lifecycle.ts` (TEST keys only).
The script cleans up its test clock/customer and never sends customer email.
Deployed staging Checkout and webhook browser verification is recorded separately.
Production funds, account activation, tax registration, operator email/inbox delivery,
real Google/email/provider acceptance and production backup restore remain separate
external/operational checks; this billing work does not certify those systems.

## Historical staging acceptance

Browser-completed hosted Checkout required a test card and terms consent and
showed 14 days free then $10/month. Direct Stripe → staging webhook delivery
granted trialing Starter access. Authenticated browser app displayed the trial.
Then the test subscription was canceled; direct webhook enforcement returned
HTTP402 for paid settings/API while the billing portal still returned HTTP200.
No real funds, production user records or live subscription were involved.

Edwin confirmed November 21, 2026: TrackRank has no sales-tax registrations yet.
Automatic tax was off at that time.
No registrations were created. This fact alone does not establish that collection
is unnecessary; actual registration/collection obligations still need review
before live launch. Do not invent registrations or mark the tax preflight passed.

## Production deployment — November 21, 2026

Live catalog IDs are recorded in `stripe-live.json`. The protected live key and
signing secret are configured in the Worker. Charges/payouts are enabled on the
merchant account; no live subscription or payment was created by setup.
`BILLING_ENABLED=true` keeps billing management and reconciliation online;
Paid purchases were paused at the time of this deployment. The current release
uses an empty live offer catalog to pause new sessions. Eligible new
organizations still receive a no-card trial.

Backups: the production database export was independently restored into SQLite
with integrity checks. Original authentication/encryption secrets were exported
only as RSA-OAEP ciphertext to the deployment owner's recovery directory; an
independent private-key decrypt successfully decrypted both application and R2
AES-GCM canaries. Production had no users, organizations, runs or raw objects at
the time, so this is not evidence of restoring populated customer workloads.
Recovery artifacts and the recovery private key were also uploaded to an
owner-only Google Drive folder and independently downloaded/hash-verified. The
folder was not shared; its only permission is Edwin as owner.

Benign alert and support messages were accepted by Resend and independently
found in the actual Gmail INBOX, including the support-address forwarding path.
The Resend status-read wrapper returned HTTP502; inbox evidence supersedes that
unavailable provider-status lookup.
The public Google flow reaches Google login; user login/consent and provider
acceptance still need the actual account. `production-journey.json` explicitly
records unfinished gates. The preflight refuses live readiness for these gaps
and the unreviewed tax obligations (zero registrations).

External monitor: `scripts/monitor-production.mjs` reads its owner token from
`.production-operations.local` (0600); it logs no credentials or customer content.
It checks public uptime, authenticated live Stripe availability, cron heartbeat,
failed/uncertain/stuck jobs and queue thresholds. Organization run counts and
DataForSEO reported costs are available in owner readiness. These are NOT
Cloudflare dollar allocations; infrastructure margin measurement still requires
actual Worker/Workflow/D1/R2 usage/billing attribution.

The monitor schedule is every five minutes (automation
`55447375-b632-4997-a3fa-b53f37d4ea34`). Failures notify Edwin's Telegram after two
consecutive failures, with a one-hour cooldown. Automated message transport is
configured but not certified by the email drill; these are different routes.
The agent automation-history tool reported a visibility limit for this CLI-created
command job; inspect it in the authenticated Automations page for run history.
See TAX-READINESS.md for the actual outstanding Washington/entity review.

## Hosted onboarding

The hosted flow is:
Pricing → Start 14-day free trial → verified Google or email/password signup →
application-managed full Starter trial → expiry paywall → choose Starter and pay.
Starting or ending this trial creates no Stripe customer, card requirement,
subscription or automatic charge. Checkout creates an immediate paid subscription,
using an active Stripe subscription to grant paid access.
The $10-before-tax price and 7-day first-paid-charge refund remain unchanged.
Paid checkout remains paused for the previously documented external launch gates;
trial enrollment follows `BILLING_ENABLED` and remains available while checkout is paused.

Trial enrollment is part of the organization-creation transaction. The account
claim permits one introductory trial per verified account. Expiry is enforced
in APIs, MCP and queued submissions;
billing recovery stays accessible and workspace history is retained. The browser
refreshes the entitlement view at expiry, but server checks are authoritative.

Provider selection catalogs are refreshed from six FREE DataForSEO metadata GETs
using `scripts/refresh-provider-options.mjs` with environment credentials. Committed
catalogs contain public supported values, never credentials, and are deduplicated/
compressed server-side. Google/Gemini support city-level searches; multi-engine
selectors use their intersection (ChatGPT's location list is country-level).
The API validates canonical values rather than trusting dropdowns.
