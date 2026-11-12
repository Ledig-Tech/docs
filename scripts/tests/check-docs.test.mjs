import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkRepository, formatFinding, scanText } from "../check-docs.mjs";

const sampleSpec = `openapi: 3.1.0
info:
  title: Synthetic example
  version: 1.0.0
paths:
  /v1/example:
    get:
      responses:
        '200':
          description: Synthetic response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Example'
components:
  schemas:
    Example:
      type: object
`;

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "ledig-docs-check-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "openapi"));
  const docs = {
    navigation: { tabs: [{ tab: "API", openapi: "openapi/public.yaml", groups: [{ group: "Example", pages: ["introduction", "GET /v1/example"] }] }] },
    api: { playground: { display: "simple" } },
    redirects: [{ source: "/old-example", destination: "/introduction" }],
  };
  await writeFile(join(root, "docs.json"), JSON.stringify(docs));
  await writeFile(join(root, "introduction.mdx"), "---\ntitle: Synthetic example\n---\nA safe example.\n");
  await writeFile(join(root, "openapi/public.yaml"), sampleSpec);
  await writeFile(join(root, "openapi/source.json"), JSON.stringify({
    sourceRevision: "a".repeat(40),
    sha256: createHash("sha256").update(sampleSpec).digest("hex"),
    operationCount: 1,
    deploymentWorkflowRunId: 1,
  }));
  return { root, docs };
}

test("validates one public artifact, provenance and mixed API/page navigation", async (t) => {
  const { root } = await fixture(t);
  const result = await checkRepository(root, { fixture: true });
  assert.deepEqual(result.errors, []);
  assert.equal(result.stats.operations, 1);
  assert.equal(result.stats.pages, 1);
});

test("credential findings and diagnostic formatting never include the matched value", () => {
  // Construct a conspicuously synthetic marker at runtime; do not commit a
  // credential-shaped fixture to a public repository to test its detection.
  const marker = ["ledig", "sk", "SYNTHETICTESTVALUE"].join("_");
  const findings = scanText("unlinked.mdx", `safe first line\n${marker}\n`);
  assert.deepEqual(findings, [{ file: "unlinked.mdx", line: 2, rule: "credential-pattern" }]);
  const diagnostic = findings.map(formatFinding).join("\n");
  assert.equal(diagnostic, "unlinked.mdx:2: credential-pattern");
  assert.equal(JSON.stringify(findings).includes(marker), false);
  assert.equal(diagnostic.includes(marker), false);
});

test("unlinked pages receive the same private-content checks", async (t) => {
  const { root } = await fixture(t);
  const forbiddenPath = ["", "internal", "synthetic"].join("/");
  await writeFile(join(root, "unlinked.mdx"), `---\ntitle: Example\n---\n${forbiddenPath}\n`);
  const { errors } = await checkRepository(root, { fixture: true });
  assert(errors.some((error) => error.file === "unlinked.mdx" && error.rule === "internal-route"));
  assert.equal(JSON.stringify(errors).includes(forbiddenPath), false);
});

test("checks ordinary pages inside OpenAPI tabs and exact operation navigation", async (t) => {
  const { root, docs } = await fixture(t);
  docs.navigation.tabs[0].groups[0].pages = ["missing-page", "POST /v1/example"];
  await writeFile(join(root, "docs.json"), JSON.stringify(docs));
  const { errors } = await checkRepository(root, { fixture: true });
  assert(errors.some((error) => error.rule === "navigation-page-missing"));
  assert(errors.some((error) => error.rule === "operation-navigation-drift"));
});

test("rejects unresolved and remote schema references without echoing them", async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, "openapi/public.yaml"), sampleSpec.replace("#/components/schemas/Example", "https://example.invalid/private-schema"));
  const { errors } = await checkRepository(root, { fixture: true });
  assert(errors.some((error) => error.rule === "unresolved-or-external-reference"));
  assert(errors.some((error) => error.rule === "artifact-checksum-mismatch"));
  assert.equal(JSON.stringify(errors).includes("example.invalid"), false);
});

test("fails when a referenced auth scheme has no definition", async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, "openapi/public.yaml"), sampleSpec + "security:\n  - MissingAuth: []\n");
  const { errors } = await checkRepository(root, { fixture: true });
  assert(errors.some((error) => error.rule === "undefined-security-scheme"));
});

test("rejects extra specs, unknown files and binary payloads even off navigation", async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, "extra.yaml"), sampleSpec);
  await writeFile(join(root, "archive.bin"), Buffer.from([0, 1, 2]));
  await writeFile(join(root, "disguised.txt"), Buffer.from([0, 1, 2]));
  const { errors } = await checkRepository(root, { fixture: true });
  for (const rule of ["extra-api-specification", "unreviewed-publication-file", "non-text-publication-file"])
    assert(errors.some((error) => error.rule === rule), rule);
});

test("rejects symlinks rather than following files outside the publication tree", async (t) => {
  const { root } = await fixture(t);
  await symlink("introduction.mdx", join(root, "linked.mdx"));
  const { errors } = await checkRepository(root, { fixture: true });
  assert(errors.some((error) => error.rule === "unsupported-file-type"));
});

test("detects extra YAML specifications with quoted keys or indented root mappings", async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, "quoted.yaml"), "'openapi': '3.1.0'\ninfo: {}\n");
  await writeFile(join(root, "indented.yaml"), "  openapi: 3.1.0\n  info: {}\n");
  const { errors } = await checkRepository(root, { fixture: true });
  for (const file of ["quoted.yaml", "indented.yaml"])
    assert(errors.some((error) => error.file === file && error.rule === "extra-api-specification"), file);
});

test("rejects stale provenance and interactive request builders", async (t) => {
  const { root, docs } = await fixture(t);
  docs.api.playground.display = "interactive";
  await writeFile(join(root, "docs.json"), JSON.stringify(docs));
  const provenance = JSON.parse(await readFile(join(root, "openapi/source.json"), "utf8"));
  provenance.operationCount = 2;
  provenance.privateSourceUrl = "https://example.invalid";
  await writeFile(join(root, "openapi/source.json"), JSON.stringify(provenance));
  const { errors } = await checkRepository(root, { fixture: true });
  for (const rule of ["artifact-operation-count-mismatch", "invalid-provenance-fields", "interactive-playground-must-remain-disabled"])
    assert(errors.some((error) => error.rule === rule), rule);
});
