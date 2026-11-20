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

The project uses the official TanStack CLI Cloudflare adapter. Production runs on Cloudflare Workers at https://trackrank.ai, with https://trackrank-ai.edninodel.workers.dev available for deployment checks. The custom domain is managed in `wrangler.jsonc`. Local development does not provision cloud resources.

`npm run deploy` builds and deploys the Worker and configured custom domain after Cloudflare authentication. Verify the Worker URL and production domain after deployment. D1, R2 and scheduled execution will be added alongside their implementations, not as unused resources. Source repository: https://github.com/trackrank-ai/track-rank (private during development).

## Product boundaries

- Bring your own DataForSEO account; provider fees are separate from hosting.
- Shared tracking core for managed hosting and eventual self-hosting.
- Hosted subscription logic must remain outside the core execution path.
- Never bundle provider credentials into browser code or commit environment files.

See [the implementation roadmap](docs/ROADMAP.md). MIT license. Product branding is TrackRank; no affiliation with OpenSEO.
