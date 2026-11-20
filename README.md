# TrackRank

Standalone AI visibility tracking for **trackrank.ai**. Built from scratch, not an OpenSEO fork. Intended for an open-source release; the repository remains private during initial development.

## Current status

Initial TanStack Start / React / Cloudflare Workers scaffold, with a responsive product-direction page. All displayed metrics are explicitly illustrative. No signup, provider execution, database persistence, or payments are implemented yet. No customer keys are collected by this scaffold.

## Local development

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000.

```sh
npm run typecheck
npm run build
```

## Deployment

The project uses the official TanStack CLI Cloudflare adapter. `wrangler.jsonc` contains no production resource IDs or domain routes. No cloud resources are provisioned by local development.

`npm run deploy` deploys the Worker after Cloudflare authentication; do not attach the production domain until staging checks pass. D1, R2 and scheduled execution will be added alongside their implementations, not as unused resources.

## Product boundaries

- Bring your own DataForSEO account; provider fees are separate from hosting.
- Shared tracking core for managed hosting and eventual self-hosting.
- Hosted subscription logic must remain outside the core execution path.
- Never bundle provider credentials into browser code or commit environment files.

See [the implementation roadmap](docs/ROADMAP.md). MIT license. Product branding is TrackRank; no affiliation with OpenSEO.
