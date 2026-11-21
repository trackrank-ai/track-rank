# Self-host TrackRank on your Cloudflare account

TrackRank is MIT-licensed. The currently supported infrastructure is Cloudflare Workers + D1 + R2 + Workflows. This is self-hosting in **your account**, not a dependency on the TrackRank hosted service. A standalone Docker/VPS deployment is not implemented yet. Local development does not require a Cloudflare account.

## 1. Requirements and installation

- Git, Node.js 22.13+ (Node 24 recommended), and npm.
- A Cloudflare account with Workers, D1, R2 and Workflows available for your deployment. Infrastructure usage may be billed by Cloudflare; consult its current plans.
- Resend credentials and a verified sending domain for hosted email signup, verification and password reset. Google sign-in is optional.
- GitHub access to clone the public MIT-licensed repository; no invitation is required.

```sh
git clone https://github.com/trackrank-ai/track-rank.git
cd track-rank
npm ci
npx wrangler login
npx wrangler whoami
```

Confirm `whoami` is your intended account. These steps create resources and deploy only when you run the corresponding commands below. Do not use the hosted service's default `npm run deploy` or `wrangler.jsonc` for your own deployment.

## 2. Create your storage and configuration

Create your own configuration by copying `wrangler.selfhost.example.json` to `wrangler.selfhost.json` (ignored by Git). Keep all binding names and class names from the example unchanged.

```sh
npx wrangler d1 create my-trackrank-db
npx wrangler r2 bucket create my-trackrank-answers
```

In `wrangler.selfhost.json`, set:

- `name`: your Worker name, for example `my-trackrank`.
- `d1_databases[0].database_id`: the ID printed by `d1 create`; `database_name` must match.
- `r2_buckets[0].bucket_name`: your bucket name.
- `workflows[0].name`: a unique workflow name in your account. Keep binding `RUN_WORKFLOW` and class `TrackingWorkflow`.
- `vars.BASE_URL`: your exact public HTTPS origin, e.g. `https://my-trackrank.YOUR-SUBDOMAIN.workers.dev` or your custom domain, **without a trailing slash**. Find your Workers subdomain in Cloudflare. For a custom domain, add the corresponding `routes` configuration for a domain you control.
- `vars.EMAIL_FROM`: a sender on your Resend-verified domain.
- `vars.PUBLIC_OPERATOR_NAME` and `vars.PUBLIC_SUPPORT_EMAIL`: your operator identity and monitored inbox. These public values appear on legal/support pages. Review and adapt the policy text to your own operations before offering the service to others; changing contact details alone is not a legal review.
- Leave `SIGNUP_ENABLED="false"` until authentication is configured and tested.

Replace **every** `REPLACE_WITH_...` value. Do not add your provider keys to this file. The helper rejects placeholder configurations and the hosted service's database ID. If you have multiple accounts, set your intended `account_id` in this file.

## 3. Apply migrations and deploy with signup closed

```sh
npm run migrate:selfhost
npm run deploy:selfhost
```

`migrate:selfhost` explicitly applies migrations to the database in your configuration. `deploy:selfhost` builds using that same configuration and deploys the generated server Worker configuration. The workflow is deployed with its Worker; cron dispatch runs every five minutes. This is a real remote deployment, not a local test.

## 4. Set deployment secrets

Generate two **different** random values locally, each with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Use one as `AUTH_SECRET` and the other as `CREDENTIALS_KEY`. Set them through Wrangler's prompts:

```sh
npx wrangler secret put AUTH_SECRET --config wrangler.selfhost.json
npx wrangler secret put CREDENTIALS_KEY --config wrangler.selfhost.json
npx wrangler secret put RESEND_API_KEY --config wrangler.selfhost.json
```

Keep secure recoverable copies of these secrets. Do not rotate `CREDENTIALS_KEY` without migrating saved credentials; do not copy local development secrets into production. Local `.dev.vars` files are **not** production secret configuration and must not be committed or shared.

For optional Google sign-in, set your own `GOOGLE_CLIENT_ID` in your config and set `GOOGLE_CLIENT_SECRET` with `wrangler secret put ... --config wrangler.selfhost.json`. Configure the exact origin and callback `${BASE_URL}/api/auth/callback/google` in Google. Neither our OAuth client nor our email provider configuration is reusable for your deployment.

Enable `SIGNUP_ENABLED="true"` in your config and run `npm run deploy:selfhost` again when ready. Do not enable the local verification bypass; production builds ignore it anyway.

## 5. First-user checks

1. Visit `/api/health`, then sign up, receive the verification email and verify it. Test reset and logout. Optional Google sign-in must complete its real callback.
2. Create an organization and workspace; invite a second account and check its assigned permissions.
3. In **organization Settings**, enter your own DataForSEO API login/password. They are stored encrypted per organization, not as shared app-wide environment keys. Optional OpenRouter key/model also belongs here.
4. Manually run a capped sample and check results and your provider bill. These are real paid provider requests. The local smoke tests deliberately do not do this.
5. Enable a test schedule, observe completion, then pause it. Localhost callbacks are not publicly reachable; hosted provider callback tests require your public HTTPS origin. Workflows also poll for results, but local dev is not equivalent to full hosted callback/cron acceptance.
6. Verify your support inbox, backups/restores and monitoring. Review [operations](OPERATIONS.md) and [launch gates](LAUNCH.md).

## Configuration reference

| Setting | Local development | Hosted/self-hosted production |
| --- | --- | --- |
| Auth/encryption secrets | Generated by `npm run setup:local` in ignored `.dev.vars` | Your Cloudflare Secrets |
| Database/storage/workflow | Local emulation via `wrangler.local.jsonc` | Your account's resources via `wrangler.selfhost.json` |
| Email/Google | Not required for local signup | Resend for email flows; Google optional |
| DataForSEO/OpenRouter | Optional, in organization Settings | Optional until real collections/analysis, in organization Settings |
| Support/operator | Local defaults | Your public deployment vars |
| PostHog | Not integrated yet; no analytics keys required | Pending optional runtime-configured integration; must not send to our project |

The hosted app currently has no implemented Stripe billing system. Self-hosting must not require a TrackRank subscription. Provider and infrastructure costs remain yours.

## Upgrades

Back up and test recovery before upgrades. Pull the release, run `npm ci`, review migrations and configuration changes, then run `npm run migrate:selfhost` and `npm run deploy:selfhost`. Database migrations may not be safely reversible; rolling back Worker code is not a database rollback. Keep the same encryption key and resource bindings unless performing a planned migration. Do not copy the repository's production bindings over your own config.

This installation guide has local build/configuration verification, not a claim of a tested fresh remote account deployment. Complete the first-user checks on your own account before serving users.

References: [Cloudflare Vite configuration](https://developers.cloudflare.com/workers/vite-plugin/reference/api/), [D1 migration commands](https://developers.cloudflare.com/workers/wrangler/commands/d1/).

## Adjustable plans

The catalog and exact organization assignments live in your D1 database, not our service. Follow [versioned plans](PLANS.md) to create your own free or paid revisions. `DEFAULT_PLAN_VERSION` only selects new organizations; existing ones remain pinned. Optional deployment rate variables are emergency ceilings, not normal plan configuration. No TrackRank subscription or billing integration is required.
