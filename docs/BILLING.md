# Hosted billing integration — sandbox implementation

## Plan and provenance

TrackRank is a direct SaaS merchant, not a Connect marketplace. Initial scope:
USD10/month Starter per organization, not per seat. Use Stripe-hosted Checkout
(Payments + Billing), recurring subscription invoices and the customer portal
(Invoicing). No standalone invoice editor is needed for this launch. Keep
Stripe Tax configurable only after verified setup. Self-hosted deployment needs
no Stripe account or keys and retains the free beta default.

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
- Active subscriptions grant mapped limits. Past-due/unpaid/canceled/paused/incomplete states block paid assignments.
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

1. Apply migrations through 0006 in staging. 0006 activates Starter but does not
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

## Remaining production gates

- No deployment, remote migration, webhook registration or live payments performed.
- No completed card purchase, renewal, refund or dispute end-to-end acceptance yet.
- Add refund/dispute/early-fraud-warning processing and operator alerting before
  production. Do not subscribe to these events until there is a tested response.
- Set up periodic reconciliation and an operational alert for webhook failures,
  unsupported prices and conflicting subscriptions. Current behavior retries via
  non-2xx responses and Stripe event logs; no operator notification service exists.
- Checkout is serialized with a two-minute token-owned D1 lease. Webhook processing
  still needs stress testing for concurrent same-second events and stale snapshot
  races, plus periodic reconciliation before a high-concurrency paid rollout.
- Starter is the only checkout tier. Future price versions require explicit
  mappings and controlled portal upgrade/downgrade/proration tests. Unsupported
  prices fail closed, not silently mapped to Starter.
- Existing beta remains free by design. Before requiring EVERY new hosted
  customer to subscribe, define an unpaid onboarding plan and its allowances;
  do not change DEFAULT_PLAN_VERSION to Starter as a shortcut.
- Tax settings read-back is `pending`; automatic_tax is NOT enabled. Confirm head
  office address, tax code, tax-inclusive/exclusive pricing and actual jurisdiction
  registrations before enabling it. Enabling automatic tax alone is insufficient.
  Prefer a least-privilege restricted live key for deployment.
- Paid terms/pricing/refunds, support verification, deletion operations, backups,
  restore, bounded polling, cost controls and other LAUNCH.md gates still apply.

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
