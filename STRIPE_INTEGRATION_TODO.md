# Stripe integration status and remaining setup

## Values to replace

No placeholder Checkout values were found. The existing subscription flow in
[billing.ts](src/server/billing.ts) resolves real Price IDs from the D1 offer catalog
and uses the deployment's organization-specific Settings URL for success/cancel.
Server credentials use `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`; neither is
browser-accessible or prefixed with `VITE_`. The installed Stripe SDK is 23.x.

## Checkout Studio parameters — pending compatibility confirmation

Scenario A applies: [billing.ts](src/server/billing.ts) already creates Checkout Sessions.
The supplied configuration requests the following parameters. **They have not yet
been applied**, because the literal removal rule conflicts with existing ownership
and session-reuse logic. Only this Checkout change is pending; catalog preparation
is independent.

| Parameter | Requested value |
|---|---|
| ui_mode | hosted_page |
| mode | subscription (preserve existing) |
| billing_address_collection | auto |
| phone_number_collection.enabled | false |
| automatic_tax.enabled | false |
| allow_promotion_codes | false |
| payment_method_collection | always |
| submit_type | auto (payment-mode only; omit for subscriptions) |
| integration_identifier | hosted_web_0001 |
| origin_context | web |
| success_url / cancel_url | Existing organization Settings URL |
| line_items | Selected real catalog Price, quantity 1 |

Confirm preserving the `customer` parameter: lifecycle webhooks map that Customer
ID to the organization; removing it would create an unrelated Customer and prevent
paid entitlement assignment. Existing metadata supports safe open-session reuse.
The template also removes terms consent and changes automatic tax to false, while
the surrounding existing live Checkout gate requires verified tax configuration.
A parameter-only patch cannot make those two tax policies consistent. Keep live
offers unpublished until this policy conflict and existing launch gates are resolved.

## Catalog and setup

The live catalog identifiers are in [stripe-tier-catalog.json](docs/stripe-tier-catalog.json).
Starter v2 is $10 / 10,000 checks / 30-day searchable history; Agency v1 is $39 /
60,000 / 90 days; Scale v1 is $99 / 250,000 / 180 days. Existing Starter v1 terms
and immutable Price mappings are preserved. No live subscription or charge was made.

Apply migration `0021` and deploy the matching Worker before using the new revisions.
Map each Price to its exact revision; publish offers only after the pre-enable gates
in [billing operations](docs/BILLING-OPERATIONS.md) pass. Current live Tax Settings
are active, but no tax registrations exist; registrations and tax policy need review.
Do not infer a registration obligation or invent registrations from this configuration.

## Flow and testing

The owner chooses an offer → authenticated server validates price/ownership → Stripe
hosted Checkout → signed lifecycle/risk webhooks reconcile the subscription and exact
revision. A success redirect never grants access. Billing portal, reconciliation,
and existing tenant authorization remain in place; no new endpoint is needed.

Run `npm test`, `npm run typecheck`, and `npm run build`. Real sandbox Checkout
acceptance is separate: use test credentials and Stripe's test card `4242 4242 4242 4242`,
any future expiry and test CVC. Never enter that card into a live Checkout Session.
Do not claim live payment acceptance until an explicitly authorized real-card test
and signed webhook have been verified.

Resources: https://support.stripe.com and https://docs.stripe.com/mcp
