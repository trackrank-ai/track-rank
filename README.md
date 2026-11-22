# TrackRank

Independent AI visibility tracking for [trackrank.ai](https://trackrank.ai). Open source under [MIT](LICENSE). [Browse, fork, report issues or contribute on GitHub](https://github.com/trackrank-ai/track-rank).

## Product features

- TanStack Start / React with shadcn/ui, Tailwind v4, self-hosted Geist typography and TrackRank branding.
- Better Auth email/password, required email verification, password reset, and Google OAuth. Resend sends transactional email.
- Organizations; owner/admin/member/viewer roles; single-use expiring team invitation links. Every organization gets a default workspace.
- Create, edit, and delete workspaces, client/own/competitor brands, and prompts. Free prompt templates and bulk prompt creation are available.
- Customer-owned DataForSEO front-end scrapers: ChatGPT, Gemini, Google Organic + AI Overviews. Standard/priority/live execution; location and language settings.
- D1 tenant metadata, private R2 raw responses, normalized answers/citations/grounding queries/organic results/provider entities, deterministic brand metrics and dated charts.
- Durable Cloudflare Workflows, signed task-correlated callbacks, polling recovery, every-five-minute Cron dispatcher, timezone-aware paused-by-default schedules.
- Organization-bound AES-256-GCM credentials, hashed/scoped/expiring/revocable API keys, REST API and Streamable HTTP MCP.
- Optional explicit OpenRouter opportunity analysis with organization-supplied key and model. Separate inference costs apply.
- Filterable run history and CSV export. Shareable research views show the answers, cited pages, and brand mentions for a domain, page, or grounding query.

See [launch status](docs/LAUNCH.md), [operations and support](docs/OPERATIONS.md), [architecture](docs/ARCHITECTURE.md), [API/MCP reference](docs/API.md), and [design system](docs/DESIGN.md).

## Three ways to run TrackRank

- **Hosted:** [trackrank.ai](https://trackrank.ai), operated by Track Rank Ai. New verified accounts can start a 14-day trial. See the [paid-launch status](docs/LAUNCH.md).
- **Self-hosted:** deploy to your own Cloudflare account using the [self-hosting guide](docs/SELF_HOSTING.md). No TrackRank subscription is required. Cloudflare/provider usage may incur costs. Standalone Docker/VPS hosting is not implemented yet.
- **Local:** follow the commands below. No Cloudflare login, Google, Resend, PostHog or paid provider key is needed to sign up and explore the app.

## Workspaces, research, and Settings

- Use the sidebar to switch between client workspaces or select **All workspaces** for the organization-wide view. **Default workspace** is a regular workspace. Workspaces share the organization's team, provider credentials, and billing.
- Use **Manage workspaces**, **Brands**, and **Prompts** to manage those records. Deleting a workspace or prompt removes its schedules and preserves collected run history and evidence.
- In **Prompts** and **Schedules**, choose **Select all on page** to select the visible rows. If more rows match, choose **Select all: N** to include every matching page in the current workspace and filters. Selections carry across pages and **Clear selection** clears them.
- In **Prompts**, paste one question per line. Use **Paste format → Comma-separated** for quoted CSV-style lists. Choose engines and review the exact wording and existing engine variants before saving. Existing matches retain their settings and tags.
- Save prompts, save with paused weekly schedules, or start collection after reviewing checks, tracked workspace brands, timing, and separate provider charges. **Other collection options** offers run-once and monitoring-only. Saving prompts or paused schedules queues zero checks. Keep the save receipt link to reopen the exact submitted variants.
- Use **Run selected** or **Schedule selected** for prompts from one workspace. The review shows provider readiness, allowance, and planned checks. Every saved prompt is available for manual runs and scheduling. Pause recurring monitoring in **Schedules**. Its bulk editor changes only the selected fields. Change the first local time to keep additional slots.
- Open a collection batch to follow queued checks to their recorded outcomes and evidence. Run history keeps filter choices in the URL and applies the same searchable scope to CSV. The library shows latest outcomes and brand mention fractions from stored run snapshots.
- In **Sources & research**, select a domain, cited page, or grounding query to see matching answers and brand mentions. Copy the detail URL to share it with teammates who have access. Open a matching answer to see its full run.
- Open **Settings** to manage the organization and providers and to access hosted billing. Your current organization appears below your email in the sidebar. Pricing, Privacy, Terms, Support, and Security links are at the bottom of Settings.

In **Prompts**, add comma-separated tags when saving or editing prompts, or add and remove tags on a selection. **Filter by tag** shows matches within the selected client workspace. Choose **All workspaces** to search across the organization.

Use **Prompt sets** in **Prompts** to group a selection from one workspace. Select all matching prompts across pages, name the set, and open **View performance**. A prompt can belong to several sets. Renaming or deleting a set preserves its prompts and collection history.

**Overview** starts with **All prompts**. Filter by set, intersect tags, and choose a recorded collection location, engine, brand and UTC date range. Copy the URL to share that view. The server computes the entire searchable period, and metric links open the contributing runs. Rates show sample fractions, and coverage shows how many selected prompts had an eligible answer. Set membership and tags reflect the current prompt library. Moving a prompt clears its set memberships and keeps earlier runs in their original workspace.

## Local development — clean checkout

Install Git and Node.js 22.13+ (Node 24 recommended), then:

```sh
git clone https://github.com/trackrank-ai/track-rank.git
cd track-rank
npm ci
npm run setup:local
npm run dev
```

Open **http://localhost:3000**. Sign up using any valid-format test email and a password of at least 12 characters. Local signup immediately opens the app without sending verification email. Existing accounts still need their correct password.

`setup:local` creates ignored `.dev.vars`, generates independent auth/encryption secrets, and applies local database migrations. It preserves existing real secrets and configuration on rerun. No manual secret generation or remote resource provisioning is required. Do not delete or change `CREDENTIALS_KEY` if you want existing saved provider credentials to remain readable.

Local development uses **`wrangler.local.jsonc`**, with no hosted account IDs, OAuth client, domain or remote storage bindings. Data persists under `.wrangler/state`. The verification bypass requires the Vite dev server and an HTTP loopback `BASE_URL`; production builds ignore it. Password-reset emails still need Resend. For real email verification locally, set `DEV_SKIP_EMAIL_VERIFICATION="false"` and configure your own Resend credentials. Google login is optional and requires your own localhost OAuth configuration.

**To collect real results**, add your DataForSEO API login and password in **Settings** after signup. For optional OpenRouter analysis, add your key and model there too. Each provider card shows whether credentials are saved and lets you replace or remove them independently. Removing DataForSEO pauses collection schedules. Removing OpenRouter disables analysis until a key is restored. Providers bill for collection and analysis requests. Verify cron and public callbacks with a scheduled run on the deployed HTTPS site.

If port 3000 is busy, update `BASE_URL` in `.dev.vars`, e.g. `http://localhost:3013`, and run `npm run dev -- --port 3013`. The URL and port must match for authentication. After upgrades, rerun `npm run setup:local` to apply new local migrations. This dedicated local config uses a different local database identity than older development builds; older scratch data is not automatically migrated into it.

```sh
npm test
npm run build
npm run typecheck
```

The core suite uses an isolated in-memory SQLite D1 test adapter and mocked provider responses. No paid provider calls or emails are sent. `scripts/local-smoke.py` exercises a running local dev server, including disposable email signup, a second-account invitation, permissions, saved app data, MCP, key revocation, and logout. Run `python3 scripts/local-smoke.py` with the local server on port 3013, or set `LOCAL_SMOKE_URL=http://localhost:3000` (matching your `BASE_URL`). It requires Python `requests`, refuses non-loopback URLs, and requires the local verification bypass before creating any accounts. It leaves disposable test data in local storage and writes a private, gitignored restart-check fixture under `.wrangler/local-smoke-state.json`. It never invokes provider collections or sends emails.

## Hosted deployment — project operator only

**Self-hosters:** use [your-own-account instructions](docs/SELF_HOSTING.md) and the `*:selfhost` commands. The default production commands below point at the TrackRank operator’s resources, not yours.

Infrastructure: Cloudflare Worker `trackrank-ai`, D1 `trackrank-db`, private R2 `trackrank-answers`, Workflow `trackrank-tracking`, and Cron `*/5 * * * *`. Deployment configuration is committed in `wrangler.jsonc`.

Back up the target database and review pending migrations before deploying. Apply pending migrations before running the matching deploy command. Migrations `0016` through `0018` switch to canonical schedules and remove obsolete billing and usage fields. Pause scheduled execution during this cutover and deploy the matching Worker before resuming. Migration `0019` is required for durable collection dispatch and `0020` is required for prompt tags. Apply `0024` before deploying prompt sets and server-side Overview analytics. Apply `0025` before deploying prompt receipts and manual collection batch views. Apply `0026` in maintenance before deploying the Worker that removes the prompt-level execution switch. It pauses any schedules that the old prompt switch was blocking. See the [billing and release runbook](docs/BILLING-OPERATIONS.md) for backup, recovery, and release checks.

Staging uses its own Cloudflare resources and Stripe test configuration.

```sh
npx wrangler d1 migrations apply trackrank-staging-db --remote --config wrangler.staging.json
npm run deploy:staging
```

Production uses the hosted service's resources.

```sh
npx wrangler d1 migrations apply trackrank-db --remote --config wrangler.jsonc
npm run deploy:production
```

Both deploy commands rebuild for their target and verify the generated Worker and D1 bindings. `npm run deploy` is a production alias. Pushing to `main` runs repository checks. Deployment is a separate operator step.

Configure app-level Google/Resend/auth/encryption values as described at [/setup](https://trackrank.ai/setup). Keep nonsecret dashboard variables synchronized in `wrangler.jsonc`; `keep_vars` also preserves dashboard-managed extras. Never put infrastructure secrets in Git. `AUTH_SECRET` and `CREDENTIALS_KEY` must remain stable across deployments.

DataForSEO/OpenRouter credentials belong in **organization Settings**, not Worker bindings. Never use a shared platform-funded provider key as the default for customer workloads.

Hosted billing starts a 14-day no-card trial for eligible new organizations. Local and self-hosted organizations use their configured plan. Migration `0015_billing_offers.sql` creates the D1 offer catalog. Use the `plans` CLI to map Stripe Prices and publish or withdraw offers. An empty catalog pauses new checkout sessions while billing management stays available. Follow the [billing and release runbook](docs/BILLING-OPERATIONS.md) for cutover and the first controlled purchase.

## License

TrackRank is licensed under the [MIT License](LICENSE).

You may use, self-host, modify, fork, redistribute, and commercially use the software, provided you retain the copyright and permission notice in copies or substantial portions. The software is provided without warranty. Third-party dependencies retain their own licenses.

The software license is separate from the hosted service’s [Terms of Service](https://trackrank.ai/terms). It does not make the hosted service, infrastructure, or third-party provider usage free. Current Cloudflare dependencies and remaining non-Cloudflare packaging work are described in [architecture](docs/ARCHITECTURE.md).

## Agent access and customer limits

Owners/admins generate scoped, expiring, revocable keys in **API & agents**. Agents can use REST and MCP on hosted, self-hosted, and local deployments. New and changed UI capabilities ship with corresponding REST and MCP support. All keys share the organization’s assigned [versioned plan allowances](docs/PLANS.md). Starter allows **120 API operations/minute**, **10,000 runs/month**, and separate limits of **10 Standard/Priority batch requests/minute** and **10 Live requests/minute**. Each batch request can contain up to 100 tasks for one engine. See [agent setup, examples, configurable limits, and retry behavior](docs/API.md#customer-rate-limits-and-retries).

## Account identity and team invitations

Google and password methods share a verified same-email user identity. Google-only users can add a password through mailbox-verified reset; duplicate signup never installs a password. Invitations are recipient-email-bound and require explicit acceptance, without merging existing accounts or organizations. See [authentication behavior and release checks](docs/AUTHENTICATION.md). Migration `0005` expires old unclaimed bearer invitations; regenerate named links after upgrading.

## Hosted subscription tiers

| Plan | USD/month before tax | Checks/month | Searchable history |
|---|---:|---:|---:|
| Starter | $10 | 10,000 | 30 days |
| Agency | $39 | 60,000 | 90 days |
| Scale | $99 | 250,000 | 180 days |

Apply migration `0021` before deploying these entitlements. Searchable history covers run lists, research and CSV exports, not automatic data deletion. Direct evidence links remain accessible with authorized product access. The hosted service uses one supported billing-account model. All three live offers are launched through the D1 billing catalog, as authorized by the owner. See [billing operations](docs/BILLING-OPERATIONS.md).

## Team billing

Each organization owns one billing account, Stripe Customer and subscription; workspaces share its allowance without per-seat fees. Owners can bulk grant/revoke billing access under **Settings → Billing administrators**, including when product access is paused. Delegation never changes workspace permissions, and removing membership revokes billing access. Billing admins can select a plan or manage payment details/invoices in the hosted portal. Agent billing tools return verified sign-in handoffs instead of payment-session bearer URLs.

Apply migration `0022` under maintenance before deploying: it replaces the old billing table without a compatibility adapter. Hosted trials use `trial-v2` (10,000 monthly checks, 30-day searchable history). Checkout follows the approved hosted configuration with automatic tax disabled; no tax registrations are changed. Cross-organization invoice consolidation and SSO/SCIM are not implemented. See [remaining Stripe setup](STRIPE_INTEGRATION_TODO.md).

## Public website and trial experience

The website and app default to light mode; the theme toggle remembers an explicit preference. Hosted trial organizations see a persistent accent banner with their Starter trial countdown and a Settings billing link. Billing permissions still apply; the banner does not grant them.

The homepage and `/pricing` use the same live published offer catalog and pricing components. All hosted plans include the same product features and operational rate limits; only monthly prompt runs and searchable history differ. For higher-volume or longer-history custom plans, email **info@trackrank.ai**. A prompt run means one prompt × one engine × one sample. Search windows do not automatically delete evidence.

The calculator estimates a 30-day workload, picks the least expensive published USD monthly plan satisfying both runs and searchable history, and adds an editable provider-cost assumption. It is not a provider quote. Comparisons use dated official competitor sources and do not imply feature/engine/retention equivalence or guaranteed savings. Refresh those sources before updating price claims.

See [contribution guidelines](CONTRIBUTING.md). Public contributions happen in forks and pull requests. The default branch requires CI and an owner code review; direct pushes, force pushes and deletion are blocked, including for administrators.
