# Stripe integration — remaining setup

## Values to replace

None. [billing.ts](src/server/billing.ts) uses real catalog Price IDs, subscription mode,
and organization-specific Settings URLs. Server keys are `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET`; neither is browser-accessible. Stripe SDK: 23.2.0.

## Configured parameters

Scenario A: the existing Checkout call in [billing.ts](src/server/billing.ts) is used;
no extra Checkout endpoint or webhook stack was added.

| Parameter | Value |
|---|---|
| ui_mode | hosted_page |
| mode | subscription |
| billing_address_collection | auto |
| phone_number_collection.enabled | false |
| automatic_tax.enabled | false |
| allow_promotion_codes | false |
| payment_method_collection | always |
| integration_identifier | hosted_web_0001 |
| origin_context | web |
| success_url / cancel_url | Real organization Settings URL |
| line_items | Real selected catalog Price, quantity 1 |

`submit_type` is omitted because Stripe only accepts it in payment mode. The
existing `customer` binding is retained as explicitly approved: Stripe Customers
belong to billing accounts, never the acting employee. Metadata and bounded expiry
are retained for safe session reuse/idempotency. Tax-ID collection, customer-update
settings, custom terms text and consent parameters were removed per the supplied
configuration. The owner instructed us to treat tax policy as reviewed and complete;
Checkout has automatic tax off. No Tax Settings or registrations were changed.

## Billing model

Organization → billing account → Stripe Customer → subscription. One account per
organization; all its workspaces share the monthly allowance. Billing access is a
separate permission delegated by owners to organization members; it does not change
workspace roles. Organization removal revokes delegated billing access. API keys can
read billing and obtain a sign-in-required management/delegation handoff, but cannot
purchase plans, obtain Stripe bearer sessions, or change billing administrators.
Billing recovery and delegation stay available while product access is suspended.

Consolidated billing across multiple organizations, finance-only identities outside
organization membership, enterprise SSO/SCIM and automated contract negotiation are
not implemented. The explicit account boundary is the foundation for those features;
sharing a Stripe Customer across unrelated organizations is deliberately prohibited.

## Deployment and next steps

1. Apply migrations through `0022` during coordinated maintenance, then deploy the
   matching Worker. This is a clean cutover: `billing_customers` is replaced, not
   supported by an adapter or dual-read path. Trial enrollment uses `trial-v2`.
2. Verify the nonsecret catalog and D1 mappings in
   [stripe-tier-catalog.json](docs/stripe-tier-catalog.json): Starter $10 / 10,000 checks /
   30 days; Agency $39 / 60,000 / 90 days; Scale $99 / 250,000 / 180 days.
3. Live offers remain unpublished until the remaining real-account acceptance gates
   in [billing operations](docs/BILLING-OPERATIONS.md) pass. Do not create a live charge
   as part of this implementation. Tax review is not a pending gate for this change.
4. Browser interaction verification of the new delegation controls is still pending:
   the environment blocked navigation to the local app. Automated REST/MCP and local
   HTTP verification are recorded separately; do not label them browser acceptance.

## Testing and flow

Authenticated billing admin selects an offer → server validates its real Price and
billing account → hosted Checkout → signed webhook reconciles the account and
commercial plan. Redirects alone never grant access. Portal and subscription/risk
webhooks remain required. Plan limits are independent of membership roles.

Run `npm test`, `npm run typecheck`, `npm run build`; the opt-in real TEST Checkout
smoke is `TRACKRANK_STRIPE_SMOKE=1 node --import tsx --test --test-name-pattern='sandbox: real checkout' tests/billing.test.ts`.
It creates and cleans up a TEST customer/session, never a live charge. Card completion
is a separate sandbox acceptance step using test card `4242 4242 4242 4242`, any future
expiry and test CVC. Never use test cards in live mode.

Resources: https://support.stripe.com and https://docs.stripe.com/mcp
