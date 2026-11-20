# Implementation roadmap

TrackRank is an independent original codebase, not an OpenSEO fork. Private initially; open-source/MIT direction. Hosted provider spend remains on customer-owned accounts.

The first hosted beta is implemented. See [launch status](LAUNCH.md) for the exact verified boundaries and remaining public-launch gates, and [architecture](ARCHITECTURE.md) for current implementation details.

## Next milestones

1. Complete real Google + Resend user acceptance and budget-capped DataForSEO runs for all three engines.
2. Measure provider latency/cost and workflow reliability, including lost callbacks and stale work.
3. Add true provider-dollar reservations/reconciliation, richer usage controls and operator alerting.
4. Add hosted billing and lifecycle handling separately from tracking execution.
5. Exercise encryption rotation, backup/restore, retention/export/deletion and cross-tenant adversarial testing.
6. Deliver and test production Docker/self-hosting with portable SQLite/S3/execution adapters. Do not ship a public wrangler-dev server as a production Docker runtime.
7. Expand research reports and precomputed historical aggregates when measured needs justify them.
