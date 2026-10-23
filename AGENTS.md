# AGENTS.md

Operating rules for everyone who edits this repository, human or AI.

## What this repository is

- Public developer documentation for Ledig, built with Mintlify.
- Pages are MDX files with YAML frontmatter.
- Configuration lives in `docs.json`.
- Every file committed here is public. Write accordingly.

## Source of truth

The `ledig-platform` repository owns the API contract, scopes, error codes, signing rules and behaviour. This repository explains them; it does not define them.

Before documenting an endpoint, scope or field, check the merged code and `docs/api/openapi.yaml` in `ledig-platform`. If the two disagree, stop and raise it; do not invent the missing half.

The public API reference is generated from `ledig-platform` and copied into `openapi/public.yaml`. Do not hand-edit that file and do not add any other OpenAPI document here: Mintlify uploads every specification in the repository and serves it as a downloadable file.

## Content boundaries

Never publish:

- API secrets, keys, signing values, database URLs, provider credentials or private keys
- customer records, personal data or real transaction payloads
- internal admin routes, staff permissions or back-office procedures
- provider identities, costs or routing logic
- retired or simulated endpoints as if they were live
- outbound webhook payloads or event names before delivery is implemented

Use placeholders such as `YOUR_API_KEY`, `LEDIG_API_KEY` and `example_quote_id`. Do not create realistic credential-shaped examples.

## Current environment facts

- Sandbox base URL: `https://api-staging.ledig.io`
- Production base URL: not published. Do not invent one.
- Support: `admin@ledig.io`
- Customer outbound webhooks: not available. Say so plainly.

Recheck these before changing them. A short-lived environment fact does not belong in five pages.

## Legacy platform

The previous platform is retired. When old behaviour must be referenced, call it **legacy infra**, **old infra**, **existing legacy platform** or **old platform infrastructure**. Do not name its vendor or product.

Do not present legacy compatibility routes as current API operations.

## Writing

- Use active voice and second person.
- Sentence case for headings.
- One idea per sentence.
- No emoji in headings or body copy.
- Code formatting for paths, headers, field names and commands.
- Every code sample must be runnable with the values a reader actually has, or clearly marked as illustrative.
- Prefer tables for headers, error codes and limits.
- Keep pages short enough to scan. Link to the page that owns a detail instead of repeating it.

Use Mintlify components already used in this repository: `Card`, `Columns`, `Steps`, `Step`, `Note`, `Warning`, `Info`, `Tip`, `CodeGroup`.

## Mintlify workflow

```bash
mint dev
mint validate
```

`mint validate` must pass before a pull request is ready. `mint dev` serves a local preview on port 3000.

Automatic deployment runs from the default branch. That means a merge publishes. Use a branch and the pull request preview, never a direct push to `main`.

## API changes

When `ledig-platform` changes the public contract:

1. Update the spec in `ledig-platform` in the same pull request.
2. Let the generated public spec sync into `openapi/public.yaml`.
3. Update the affected guide and examples here.
4. Never document a field or operation that the runtime does not return.

## Review

A pull request is ready when:

- `mint validate` passes
- internal links resolve
- no forbidden content from the list above is present
- examples match the current contract
- any removed page has a redirect in `docs.json` if it was publicly linked

Removing a page that existing customers may use needs a human decision and a redirect. Do not delete silently.
