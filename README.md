# TrackRank

Independent AI visibility tracking for [trackrank.ai](https://trackrank.ai). Original standalone codebase, not an OpenSEO fork. Private during development; MIT license and eventual open-source release.

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

This is a beta, not a finished paid SaaS. See [launch status](docs/LAUNCH.md), [architecture](docs/ARCHITECTURE.md), [API/MCP reference](docs/API.md), and [design system](docs/DESIGN.md).

## Local development

Node.js 22.13+ (Node 24 recommended) and npm:

```sh
npm ci
cp .dev.vars.example .dev.vars
# Fill the local auth and encryption secrets; never commit .dev.vars.
npx wrangler d1 migrations apply trackrank-db --local
npm run dev
```

Use `BASE_URL=http://localhost:3000` for the dev server. Local email delivery requires your own Resend setup. Google OAuth requires a separate localhost origin/callback configured in Google. Local storage is isolated under `.wrangler/state`. Running local development does not provision remote resources.

```sh
npm test
npm run build
npm run typecheck
```

The core suite uses an isolated in-memory SQLite D1 test adapter and mocked provider responses. No paid provider calls or emails are sent. `scripts/local-smoke.py` is an additional operator-run HTTP test requiring a generated, verified local-only account fixture; it is not a public test-account bootstrap endpoint.

## Production

Infrastructure: Cloudflare Worker `trackrank-ai`, D1 `trackrank-db`, private R2 `trackrank-answers`, Workflow `trackrank-tracking`, and Cron `*/5 * * * *`. Deployment configuration is committed in `wrangler.jsonc`.

```sh
npx wrangler d1 migrations apply trackrank-db --remote
npm run deploy
```

Configure app-level Google/Resend/auth/encryption values as described at [/setup](https://trackrank.ai/setup). Keep nonsecret dashboard variables synchronized in `wrangler.jsonc`; `keep_vars` also preserves dashboard-managed extras. Never put infrastructure secrets in Git. `AUTH_SECRET` and `CREDENTIALS_KEY` must remain stable across deployments.

DataForSEO/OpenRouter credentials belong in **organization Settings**, not Worker bindings. Never use a shared platform-funded provider key as the default for customer workloads.

Docker production packaging, full provider-cost reservation, billing, restore drills, and sustained load tests remain future work. No claims of free/unlimited execution or automatic ranking improvements.
