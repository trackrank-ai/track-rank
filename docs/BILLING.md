# Hosted billing integration — sandbox implementation

## Plan and provenance

TrackRank is a direct SaaS merchant, not a Connect marketplace. Initial scope:
14-day no-card application-managed trial; explicit paid upgrade to USD10/month Starter per organization, not per seat. Use Stripe-hosted Checkout
(Payments + Billing), recurring subscription invoices and the customer portal
(Invoicing). Live Checkout always uses Stripe Tax with a verified registration
and product tax code. Self-hosted deployment needs no Stripe account or keys.

The requested Claude plugin marketplace installation failed. Added the Stripe
HTTP MCP definition to Claude's local configuration; OAuth connection is not
verified and no planner MCP tool was exposed in this conversation. Installed
Stripe's official skills using `npx skills add https://docs.stripe.com --yes`.
The official CLI planner was attempted with full business context but returned
an unrecognized implementation_planner endpoint. This is a documentation-based
plan, NOT an accepted/generated Stripe planner result.

References:
- https://docs.stripe.com/billing/subscriptions/webhooks
- https://docs.stripe.com/customer-management/integrate-customer-portal
- https://docs.stripe.com/tax/set-up

## Implemented

- Latest installed stripe-node SDK (23.2.0), Worker fetch client and async WebCrypto signature checks.
- Owner-only authenticated checkout and portal; no API-key billing access.
- Server-selected price checked against exact immutable Starter plan revision.
- Stable Stripe customer idempotency, leased D1 checkout lock, duplicate checkout reuse and existing subscription protection.
- Raw-body signature and timestamp verification, environment matching, current subscription retrieval.
- Subscription and invoice events, plus Checkout completion/async-success events.
- Transactional event deduplication, stale event protection, tenant mapping by locally recorded Customer ID.
- Active and trialing subscriptions grant mapped limits. Past-due/unpaid/canceled/paused/incomplete states block paid assignments.
- Cancellation at period end retains access while Stripe reports active.
- Paid access checked in common plan resolution for UI/API/MCP/provider dispatch.
- Billing endpoints bypass paid access and monthly quotas so owners can recover.
- Existing free beta tenants remain free; checkout creation/redirect never grants paid access.
- Portal configured for invoice history, payment details and period-end cancellation. No upgrades enabled.

## Local credentials and sandbox catalog

Supplied test keys are in `.dev.vars.stripe` (0600, git-ignored). Never commit it.
The publishable key is not needed for server-created hosted Checkout redirects.
Nonsecret catalog IDs are in `stripe-sandbox.json`. These are TEST-mode IDs only.
Smoke tests created a test Customer and Checkout Session, without card details,
payment, email or a production deployment.

## Deploy/configure in staging before production

1. Apply migrations through 0007 in staging. 0006 activates Starter but does not
   assign it to anyone or change the free beta default.
2. Insert sandbox price mapping using the price ID in stripe-sandbox.json:
   `INSERT INTO billing_prices VALUES('<sandbox price>','starter-v1',0);`
3. Configure `BILLING_ENABLED=true`, `STRIPE_STARTER_PRICE_ID` and
   `STRIPE_PORTAL_CONFIGURATION` in staging. Store `STRIPE_SECRET_KEY` and
   `STRIPE_WEBHOOK_SECRET` as Worker secrets, never committed config.
4. Register a Stripe webhook at the STAGING `/api/billing/webhook`. Subscribe to
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `customer.subscription.paused`,
   `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`,
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`.
   Use the SDK-compatible event API version. Keep the signing secret private.
   For localhost, Stripe CLI forwarding supplies its own signing secret.
5. Test actual card completion, webhook delivery/retries, delayed payment,
   failure/recovery, period-end cancellation, organization isolation, UI recovery,
   scheduled/API/MCP denial. Reconcile Stripe state against D1 after any outage.
6. Live mode requires separate live catalog IDs/mapping (`livemode=1`), keys,
   endpoint secret, portal configuration and live verification. None are configured.

## Production preparation follow-up (November 21)

See [BILLING-OPERATIONS.md](BILLING-OPERATIONS.md) for current rollout, review and
rollback instructions. The original sandbox status above is historical; the
follow-up added a deployed isolated staging Worker, migrations through 0007,
registered TEST webhook, card-required 14-day trial, confirmed refund policy,
published staging pricing/terms/privacy, customer synchronization leases,
fair cron reconciliation, 24-hour snapshot freshness enforcement, pending
onboarding, refund/dispute/fraud review and persistent retryable alert delivery.

Real test-card lifecycle and actual Stripe-signed CLI webhook evidence is under
`reports/billing-acceptance/lifecycle.json`. This includes trial conversion,
failed renewal, payment recovery, a real TEST refund, cancellation and repairing
local drift. It is not a live payment and is not a production backup drill.

See the [billing operations runbook](BILLING-OPERATIONS.md) for live setup,
acceptance and rollback. An empty Starter Price binding pauses new Checkout
sessions while existing customers retain access to billing management.

## Verification

`npm run typecheck`, `npm test`, `npm run build`.
Opt-in external smoke: `TRACKRANK_STRIPE_SMOKE=1 node --import tsx --test tests/billing.test.ts`.
This reads the private local Stripe vars and creates/reuses TEST-mode objects.

## Rollback

Keep billing disabled until staging acceptance. Migration is additive, but paid
assignments fail closed without valid billing state. For a release rollback,
retain all billing tables/mappings/events and secrets; do not restore old code
that grants paid access from a plan assignment alone. Pause new checkout while
keeping webhook/portal recovery available. Do not delete encrypted customer
credentials or rotate their encryption key as part of billing rollback.

The later no-card revision supersedes historical card-required TEST evidence below. See BILLING-OPERATIONS.md and no-card-trial.json for the revised flow.
