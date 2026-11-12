# AGENTS.md

Operating rules for everyone who edits this repository, human or AI.

## What this repository is

- Public developer documentation for Ledig, built with Mintlify.
- Pages are MDX files with YAML frontmatter.
- Configuration lives in `docs.json`.
- Every file committed here is public. Write accordingly.

## Source of truth

The backend owns the API contract, scopes, error codes, signing rules and behaviour. This repository explains the released customer contract; it does not define it.

Before documenting an endpoint, scope or field, check the owning implementation and the deployed public contract. A source merge alone does not prove deployment or customer availability. If code and contract disagree, raise it; do not invent the missing half.

The public API reference is generated in the backend and copied into `openapi/public.yaml`. Its provenance is recorded in `openapi/source.json`: source revision, SHA-256 digest, operation count and, when available, deployment workflow run ID. Verify the digest and release evidence together. Do not hand-edit the generated specification or add another OpenAPI document; specifications can be served as downloadable files even when absent from navigation.

## Content boundaries

Never publish:

- API secrets, keys, signing values, database URLs, provider credentials or private keys
- customer records, personal data or real transaction payloads
- internal admin routes, staff permissions or back-office procedures
- provider identities, costs or routing logic
- private repository links, internal plans or operational evidence
- retired or simulated endpoints as if they were live
- outbound webhook payloads or event names before the documented access and delivery behaviour are verified

Use placeholders such as `YOUR_API_KEY`, `LEDIG_API_KEY` and `example_quote_id`. Do not create realistic credential-shaped examples.

## Current environment facts

- Engineering staging: `https://api-staging.ledig.io`, for authorised controlled integration testing. It is not the future customer sandbox, and staging must not be described as universally simulated.
- The customer sandbox and production access instructions are planned separately. Do not invent their hosts, credentials or test-funding behaviour.
- Runnable examples use `LEDIG_API_BASE_URL` supplied by Ledig for the approved environment, with no default production target.
- Support: `admin@ledig.io`
- Customer webhooks depend on deployment configuration and the integration agreement. They are not in the current published endpoint reference. Do not describe them as universally enabled or disabled; publish a delivery contract only after verification.

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
npm ci
npm run dev
npm run check
```

Use the pinned tools and lockfile. `npm run check` runs the content checks, regression tests, Mintlify validation and broken-link checks. `npm run check:content` runs the repository guard by itself. The local preview runs on port 3000.

Use a branch and review the rendered changes before merging; never push directly to `main`. The Mintlify project, source repository, branch, root directory and custom-domain mapping must be confirmed before publication. This repository's existence is not proof that it currently serves the live domain. Once the reviewed connection is active, a merge to its deployment branch can publish immediately. Preview URLs may be public.

## API changes

When the backend changes the public contract:

1. Change and validate the owning contract with its implementation.
2. Copy only the generated customer specification and safe provenance into a reviewable docs pull request.
3. Update affected guides, examples and navigation; automated copying does not verify prose.
4. Confirm the documented revision is deployed and appropriate for the intended environment before publication.
5. Never document a field or operation that the runtime does not return.

## Review

A pull request is ready when:

- `npm run check` and required CI checks pass
- the generated artifact's digest, operation navigation and source revision agree
- deployment evidence supports present-tense availability claims
- internal links resolve
- no forbidden content from the list above is present
- examples match the current contract
- any removed page has a redirect in `docs.json` if it was publicly linked

Removing a page that existing customers may use needs a human decision and a redirect. Do not delete silently.
