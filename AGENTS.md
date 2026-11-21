# TrackRank product principles

- **Bulk by default.** Collection interfaces lead with selection/select-all and shared actions. Creating, editing, running, pausing and scheduling should work on batches; a single item is a batch of one, not the primary interaction model.
- Use progressive disclosure. Keep common tasks simple. Put location/language overrides, execution details, repeated samples and extra daily time slots under Advanced, with visible defaults and estimated total runs.
- Repeated samples are independent provider requests with distinct identities. Retries must be idempotent and must never quietly resubmit uncertain/accepted provider work.
- Explain Organization (team/billing/credentials) → Workspaces (client/brand/campaign folders) → Prompts, with multiple tracked brands per workspace.
- Default poisoned-SERP fixing on for Google. Preserve organic blue links separately from AI Overview evidence.
- Trial onboarding: 14 days, no card or automatic charge. Payment is requested explicitly afterward. Existing Stripe subscriptions keep their agreed schedule. Hosted checkout remains paused until the documented live gates are cleared.
