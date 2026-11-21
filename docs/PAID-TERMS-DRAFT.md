# Paid beta commercial terms — operator approved November 21, 2026

Commercial choices confirmed by Edwin. Technical production activation still requires live configuration and acceptance.

- Starter: USD $10 per month per organization, not per seat.
- Price presentation: $10 before applicable taxes, with the final total shown in Checkout. Automatic tax remains disabled until tax settings, code and actual registrations are confirmed.
- A 14-day application-managed free trial requires a verified account, not a payment card. No automatic charge occurs. At expiry, product access pauses until an explicit paid upgrade succeeds. One introductory trial per account; creating another organization does not restart it. Existing Stripe agreements are unchanged.
- Renews monthly until canceled. The owner can cancel through Manage billing; cancellation takes effect at the current period end. No further subscription renewal after cancellation takes effect.
- Refund policy: full refund requested within 7 days of the first paid subscription charge; subsequent charges handled case by case, subject to mandatory rights. A free trial itself has no charge to refund.
- Plan revision starter-v1 includes 6,000 runs per UTC calendar month, 120 API operations per minute, and 10 provider operations per minute. The run allowance resets at midnight UTC on the first and unused runs do not roll over. Rate limits and infrastructure capacity affect when queued runs start.
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
