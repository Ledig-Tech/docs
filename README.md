# Ledig developer docs

Public developer documentation for Ledig, built with [Mintlify](https://mintlify.com). The site is deployed at [docs.ledig.io](https://docs.ledig.io).

## Local development

Install the Mintlify CLI and run the preview from the repository root:

```bash
npm install -g mint
mint dev
```

The preview is served at `http://localhost:3000`.

Validate before opening a pull request:

```bash
mint validate
node scripts/check-docs.mjs
```

## Structure

```text
docs.json                           site name, navigation, redirects
index.mdx                           landing page
introduction.mdx                    platform overview and environments
quickstart.mdx                      access to first signed request
auth/authentication.mdx             HMAC signing and key lifecycle
errors/errors-and-troubleshooting.mdx   envelope, codes, limits, retries
hooks/webhooks.mdx                  delivery status and polling
api-reference/introduction.mdx      API reference landing page
openapi/public.yaml                 generated public contract (when available)
logo/, favicon.png                  brand assets
scripts/check-docs.mjs              repository guards
```

## Source of truth

The API contract is owned by [`ledig-platform`](https://github.com/Ledig-Tech/ledig-platform). The public OpenAPI document is generated there and synced into `openapi/public.yaml`. Do not add a second specification to this repository; Mintlify serves every specification it finds.

Read [AGENTS.md](AGENTS.md) before changing content. Everything here is public.

## Deployment

Mintlify deploys the default branch automatically. Work on a branch and use the pull request preview. A merge publishes to `docs.ledig.io`.

## Support

Questions about the API or access: [admin@ledig.io](mailto:admin@ledig.io).
