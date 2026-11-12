# Ledig developer docs

Public developer documentation for Ledig, built with [Mintlify](https://mintlify.com). The intended publication domain is [docs.ledig.io](https://docs.ledig.io); confirm its Mintlify project and repository mapping before publishing this source.

## Local development

Install the pinned dependencies and run the preview from the repository root:

```bash
npm ci
npm run dev
```

The preview is served at `http://localhost:3000`.

Validate before opening a pull request:

```bash
npm run check
```

The check command runs the content guard, regression tests, Mintlify validation and broken-link checks. Use `npm run check:content` for the content guard alone. The lockfile pins transitive dependencies, and the preview renderer revision is pinned in package scripts; update tools in a reviewed change. The renderer download still requires a network connection.

Temporary, narrowly scoped npm overrides update the Mintlify CLI's `sharp` dependency to `0.35.5` and the optional package builder's `js-yaml` dependency to `4.3.2`, because the pinned upstream tools still require versions affected by published security advisories. These overrides cover this repository's local and CI tools; they do not establish the versions used by Mintlify's managed service. When upgrading Mintlify, remove an override only after the resolved dependency is patched and the full documentation checks, asset rendering and `npm audit` pass.

## Structure

| Path | Purpose |
| --- | --- |
| `docs.json` | Site configuration, navigation and redirects |
| `index.mdx`, `introduction.mdx`, `quickstart.mdx` | Overview and first request |
| `auth/`, `errors/`, `guides/`, `hooks/` | Client integration guidance |
| `api-reference/introduction.mdx` | Endpoint reference entry point |
| `openapi/public.yaml` | Generated customer contract |
| `openapi/source.json` | Source revision, digest, operation count and optional deployment run ID |
| `logo/`, `favicon.svg` | Brand assets |
| `scripts/` | Repository validation and regression tests |

## Source of truth

The backend owns the API contract. Copy only its validated customer artifact into `openapi/public.yaml` and record safe provenance in `openapi/source.json`. Do not hand-edit the generated file or add a second specification. A contract update requires review of the affected guides and examples as well as the reference.

The source revision and digest identify the artifact; they do not by themselves prove deployment or customer availability. Review release evidence before publishing a new capability.

Read [AGENTS.md](AGENTS.md) before changing content. Everything here is public.

## Deployment

Work on a branch and review a local or hosted preview. Before publication, confirm the correct Mintlify project, this repository, the deployment branch, repository root and custom domain. Do not switch the live project to incomplete content. Once that connection is active, merging to the deployment branch can publish immediately.

Require review and successful checks on the deployment branch. Keep the previous known-good deployment available for rollback. A documentation preview is not an API sandbox.

## Support

Questions about the API or access: [admin@ledig.io](mailto:admin@ledig.io).
