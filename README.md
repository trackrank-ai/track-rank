# TrackRank

Independent AI visibility tracking for [trackrank.ai](https://trackrank.ai). Original standalone codebase, not an OpenSEO fork. Private during development; licensed under [MIT](LICENSE), with an eventual public source release planned.

## Working beta

- TanStack Start / React with shadcn/ui, Tailwind v4, self-hosted Geist typography and TrackRank branding.
- Better Auth email/password, required email verification, password reset, and Google OAuth. Resend sends transactional email.
- Organizations; owner/admin/member/viewer roles; single-use expiring team invitation links. Every organization gets a default workspace.
- Workspaces, own/client/competitor brands and aliases, prompt creation/editing, free template suggestions.
- Customer-owned DataForSEO front-end scrapers: ChatGPT, Gemini, Google Organic + AI Overviews. Standard/priority/live execution; location and language settings.
- D1 tenant metadata, private R2 raw responses, normalized answers/citations/grounding queries/organic results/provider entities, deterministic brand metrics and dated charts.
- Durable Cloudflare Workflows, signed task-correlated callbacks, polling recovery, every-five-minute Cron dispatcher, timezone-aware paused-by-default schedules.
- Organization-bound AES-256-GCM credentials, hashed/scoped/expiring/revocable API keys, REST API and Streamable HTTP MCP.
- Optional explicit OpenRouter opportunity analysis with organization-supplied key and model. Separate inference costs apply.
- Run history and CSV export. Homepage product mock remains explicitly illustrative; authenticated app shows actual collected data only.

This is a beta, not a finished paid SaaS. See [launch status](docs/LAUNCH.md), [operations and support](docs/OPERATIONS.md), [architecture](docs/ARCHITECTURE.md), [API/MCP reference](docs/API.md), and [design system](docs/DESIGN.md).

## Three ways to run TrackRank

- **Hosted:** [trackrank.ai](https://trackrank.ai), operated by Track Rank Ai. It is a beta; [paid-launch gates](docs/LAUNCH.md) are still outstanding.
- **Self-hosted:** deploy to your own Cloudflare account using the [self-hosting guide](docs/SELF_HOSTING.md). No TrackRank subscription is required. Cloudflare/provider usage may incur costs. Standalone Docker/VPS hosting is not implemented yet.
- **Local:** follow the commands below. No Cloudflare login, Google, Resend, PostHog or paid provider key is needed to sign up and explore the app.

## Local development — clean checkout

Install Git and Node.js 22.13+ (Node 24 recommended), then:

```sh
git clone https://github.com/trackrank-ai/track-rank.git
cd track-rank
npm ci
npm run setup:local
npm run dev
```

Open **http://localhost:3000**. The repository is private during development, so cloning currently requires access. Sign up using any valid-format test email and a password of at least 12 characters. Local signup immediately opens the app without sending verification email. Existing accounts still need their correct password.

`setup:local` creates ignored `.dev.vars`, generates independent auth/encryption secrets, and applies local database migrations. It preserves existing real secrets and configuration on rerun. No manual secret generation or remote resource provisioning is required. Do not delete or change `CREDENTIALS_KEY` if you want existing saved provider credentials to remain readable.

Local development uses **`wrangler.local.jsonc`**, with no hosted account IDs, OAuth client, domain or remote storage bindings. Data persists under `.wrangler/state`. The verification bypass requires the Vite dev server and an HTTP loopback `BASE_URL`; production builds ignore it. Password-reset emails still need Resend. For real email verification locally, set `DEV_SKIP_EMAIL_VERIFICATION="false"` and configure your own Resend credentials. Google login is optional and requires your own localhost OAuth configuration.

**To collect real results:** add your DataForSEO API login/password in **organization Settings** after signup—not in the environment file. Optional OpenRouter analysis also uses organization Settings. These requests are billed by the provider; the app UI and setup do not need them. A local dev server is not proof of hosted cron/public-callback execution; verify one scheduled run on the deployed HTTPS site.

If port 3000 is busy, update `BASE_URL` in `.dev.vars`, e.g. `http://localhost:3013`, and run `npm run dev -- --port 3013`. The URL and port must match for authentication. After upgrades, rerun `npm run setup:local` to apply new local migrations. This dedicated local config uses a different local database identity than older development builds; older scratch data is not automatically migrated into it.

```sh
npm test
npm run build
npm run typecheck
```

The core suite uses an isolated in-memory SQLite D1 test adapter and mocked provider responses. No paid provider calls or emails are sent. `scripts/local-smoke.py` exercises a running local dev server, including disposable email signup, a second-account invitation, permissions, saved app data, MCP, key revocation, and logout. Run `python3 scripts/local-smoke.py` with the local server on port 3013, or set `LOCAL_SMOKE_URL=http://localhost:3000` (matching your `BASE_URL`). It requires Python `requests`, refuses non-loopback URLs, and requires the local verification bypass before creating any accounts. It leaves disposable test data in local storage and writes a private, gitignored restart-check fixture under `.wrangler/local-smoke-state.json`. It never invokes provider collections or sends emails.

## Hosted production — project operator only

**Self-hosters:** use [your-own-account instructions](docs/SELF_HOSTING.md) and the `*:selfhost` commands. The default production commands below point at the TrackRank operator’s resources, not yours.


Infrastructure: Cloudflare Worker `trackrank-ai`, D1 `trackrank-db`, private R2 `trackrank-answers`, Workflow `trackrank-tracking`, and Cron `*/5 * * * *`. Deployment configuration is committed in `wrangler.jsonc`.

```sh
npx wrangler d1 migrations apply trackrank-db --remote
npm run deploy
```

Configure app-level Google/Resend/auth/encryption values as described at [/setup](https://trackrank.ai/setup). Keep nonsecret dashboard variables synchronized in `wrangler.jsonc`; `keep_vars` also preserves dashboard-managed extras. Never put infrastructure secrets in Git. `AUTH_SECRET` and `CREDENTIALS_KEY` must remain stable across deployments.

DataForSEO/OpenRouter credentials belong in **organization Settings**, not Worker bindings. Never use a shared platform-funded provider key as the default for customer workloads.

Docker production packaging, full provider-cost reservation, billing, restore drills, and sustained load tests remain future work. No claims of free/unlimited execution or automatic ranking improvements.

## License

TrackRank is licensed under the [MIT License](LICENSE), the same license used by [OpenSEO](https://github.com/every-app/open-seo/blob/main/LICENSE).

You may use, self-host, modify, fork, redistribute, and commercially use the software, provided you retain the copyright and permission notice in copies or substantial portions. The software is provided without warranty. Third-party dependencies retain their own licenses.

The software license is separate from the hosted service’s [Terms of Service](https://trackrank.ai/terms). It does not make the hosted service, infrastructure, or third-party provider usage free. Current Cloudflare dependencies and remaining non-Cloudflare packaging work are described in [architecture](docs/ARCHITECTURE.md).

## Agent access and customer limits

Owners/admins generate scoped, expiring, revocable keys in **API & agents**. Agents can use REST or the MCP wrapper on hosted, self-hosted, and local deployments. All keys share the organization’s assigned [versioned plan allowances](docs/PLANS.md). Beta/Starter allow **120 API operations/minute** and **10 provider operations/minute**; Starter’s draft includes **200,000 API operations and 6,000 runs/month**. Existing organizations stay on Beta; paid billing is not enabled. See [agent setup, examples, configurable limits, and retry behavior](docs/API.md#customer-rate-limits-and-retries).

## Account identity and team invitations

Google and password methods share a verified same-email user identity. Google-only users can add a password through mailbox-verified reset; duplicate signup never installs a password. Invitations are recipient-email-bound and require explicit acceptance, without merging existing accounts or organizations. See [authentication behavior and release checks](docs/AUTHENTICATION.md). Migration `0005` expires old unclaimed bearer invitations; regenerate named links after upgrading.
