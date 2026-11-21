# Paid beta commercial terms — operator approved November 21, 2026

Commercial choices confirmed by Edwin. Technical production activation still requires live configuration and acceptance.

- Starter: USD $10 per month per organization, not per seat.
- Price presentation: $10 before applicable taxes, with the final total shown in Checkout. Automatic tax remains disabled until tax settings, code and actual registrations are confirmed.
- A 14-day free trial requires a payment card at signup. Unless canceled before trial expiry, the first monthly charge is collected automatically when the trial ends. One introductory trial per organization; canceling and resubscribing does not restart it.
- Renews monthly until canceled. The owner can cancel through Manage billing; cancellation takes effect at the current period end. No further subscription renewal after cancellation takes effect.
- Refund policy: full refund requested within 7 days of the first paid subscription charge; subsequent charges handled case by case, subject to mandatory rights. A free trial itself has no charge to refund.
- Plan revision starter-v1 includes 200,000 API operations/month and 6,000 tracking runs/month, 120 API operations/minute, 10 provider operations/minute and 3 concurrent runs. Monthly allowances reset on the first UTC, not the subscription anniversary. Unused allowances do not roll over. Safety ceilings and the organization's daily run guardrail may be lower.
- No per-seat or API-key-count limit. Limits are shared across users and keys, not added per seat.
- BYOK provider charges (DataForSEO/OpenRouter) are separate and not included in the $10 subscription. Run allowances are not a guaranteed dollar budget.
- Failed renewal suspends paid tracking/access until payment is resolved. Billing management remains reachable. Cancellation does not automatically delete account/workspace data.
- Existing invited free-beta organizations are not silently enrolled or charged. Self-hosting is free and does not depend on hosted billing.
- Contact info@trackrank.ai for billing concerns, refunds or verified deletion requests. Mandatory consumer rights remain unaffected.

## Privacy text ready for publication with the paid offering

Stripe processes subscription payment details and billing contact/address data directly. TrackRank stores Stripe Customer, Subscription and Price IDs, billing state, period-end/cancellation metadata, event deduplication records and operational risk/alert records. TrackRank does not store complete card numbers or card security codes. Stripe's own privacy practices apply to its services. Billing records needed for legal/accounting obligations may need retention after workspace deletion.

## Publication rule

Do not silently rewrite the current free-beta terms while checkout is disabled.
Once commercial choices are confirmed, publish the terms/pricing/privacy update,
configure the Stripe business profile terms/privacy URLs, and require Checkout
terms acceptance (implemented in the session request).
