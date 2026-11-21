# Contributing to TrackRank

TrackRank is MIT-licensed. You can fork, self-host, modify, open issues and propose pull requests without write access to this repository.

1. Fork the repository and branch from `main`.
2. Read [AGENTS.md](AGENTS.md), [README.md](README.md) and the relevant reference docs.
3. Keep changes focused. Never include credentials, private exports, customer data or generated build files.
4. Run `npm ci`, `npm run setup:local`, and the relevant checks: `npm test`, `npm run build`, `npm run typecheck`.
5. Open a pull request explaining the change and verification. A maintainer reviews and merges it after CI passes.

`main` does not accept direct pushes, force pushes or deletion, including from administrators. Changes require a pull request, passing `check` CI and approval from the CODEOWNER, @eninodel. New commits dismiss stale approvals. Opening a PR does not grant write access. Only maintainers can merge; an approval does not itself publish a deployment.

For bugs and feature requests, [open an issue](https://github.com/trackrank-ai/track-rank/issues). Do not post secrets or exploitable security details publicly; report those privately to info@trackrank.ai. Custom hosted-plan requests also go to info@trackrank.ai.
