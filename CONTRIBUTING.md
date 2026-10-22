# Contributing

## Before you write

Read [AGENTS.md](AGENTS.md). This repository is public and the API contract is owned by `ledig-platform`.

## Workflow

1. Branch from `main`. Do not push to `main`; a merge deploys the site.
2. Run `mint dev` and edit the MDX page.
3. Run `mint validate` and `node scripts/check-docs.mjs`.
4. Open a pull request with the page preview link and a short summary.
5. Request review from the API owner for contract changes, or from Docs for wording.

## What reviewers check

- Examples match the current runtime contract.
- No secrets, customer data, internal routes or provider details.
- Links resolve and navigation still builds.
- Removed pages have redirects in `docs.json`.
- The change does not present legacy or simulated behaviour as current.

## Style

Follow [AGENTS.md](AGENTS.md#writing). Keep pages short, use sentence case, and prefer a table over a long list when the content is tabular.
