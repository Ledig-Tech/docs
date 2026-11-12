# Contributing

## Before you write

Read [AGENTS.md](AGENTS.md). This repository is public; the backend owns the API contract. Files remain public even when excluded from the website by `.mintignore`.

## Workflow

1. Branch from `main`; never push directly to it.
2. Run `npm ci`, then `npm run dev`, and edit the MDX page.
3. Run `npm run check`. Use `npm run check:content` when iterating on content checks.
4. Open a pull request with the preview, a short summary and the actual validation results. Do not include private source links or internal evidence in this public discussion.
5. Request review from the API owner for contract changes, or from Docs for wording.
6. Before merging, confirm the intended Mintlify project and deployment mapping. A merge can publish immediately when that connection is active.

## What reviewers check

- Examples match the deployed customer contract and the approved environment.
- `openapi/public.yaml` matches the source revision and SHA-256 digest in `openapi/source.json`; navigation covers exactly its operations.
- Generated artifact updates receive guide and example review; copying a file does not establish release readiness.
- No secrets, customer data, internal routes or provider details.
- No private repository links or internal plans.
- Links resolve and navigation still builds.
- Removed pages have redirects in `docs.json`.
- The change does not present legacy or simulated behaviour as current.
- Engineering staging is not called the future customer sandbox, and examples have no implicit production target.

## Style

Follow [AGENTS.md](AGENTS.md#writing). Keep pages short, use sentence case, and prefer a table over a long list when the content is tabular.
