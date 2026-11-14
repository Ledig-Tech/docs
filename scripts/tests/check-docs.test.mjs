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
  contact:
    email: support@ledig.io
servers:
  - url: https://sandbox.ledig.io
  - url: https://api.ledig.io
paths:
  /v1/example:
    get:
      x-codeSamples:
        - lang: JavaScript
          source: "const response = await fetch('https://sandbox.ledig.io/v1/example');"
      responses:
        '200':
          description: Synthetic response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Example'
              example:
                currency: USD
                available: '1250.00'
components:
  schemas:
    Example:
      type: object
      additionalProperties: false
      required: [currency, available]
      properties:
        currency:
          type: string
          enum: [USD, USDT]
        available:
          type: string
          pattern: '^[0-9]+[.][0-9]{2}$'
`;

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "ledig-docs-check-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "openapi"));
  const docs = {
    navigation: { tabs: [{ tab: "API", openapi: "openapi/public.yaml", groups: [{ group: "Example", pages: ["introduction", "GET /v1/example"] }] }] },
    api: { playground: { display: "simple" }, examples: { autogenerate: false } },
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

async function replaceSpec(root, text) {
  await writeFile(join(root, "openapi/public.yaml"), text);
  const path = join(root, "openapi/source.json");
  const source = JSON.parse(await readFile(path, "utf8"));
  source.sha256 = createHash("sha256").update(text).digest("hex");
  await writeFile(path, JSON.stringify(source));
}

test("accepts the approved public environments and support contact", async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, "unlinked.mdx"), "Use https://sandbox.ledig.io for Sandbox and https://api.ledig.io for Live. Contact support@ledig.io.");
  assert.deepEqual((await checkRepository(root, { fixture: true })).errors, []);
});

test("rejects internal customer content even in drafts and unlinked assets", async (t) => {
  const { root } = await fixture(t);
  const samples = [
    ["internal-environment-host", ["api-staging", "ledig", "io"].join(".")],
    ["internal-support-address", ["admin", "ledig.io"].join("@")],
    ["provider-implementation-detail", ["Flutter", "wave"].join("")],
    ["internal-engineering-language", ["effective", "financial", "profile"].join(" ")],
    ["internal-route", ["", "v1", "admin", "balances"].join("/")],
  ];
  await mkdir(join(root, "drafts"));
  for (const [index, [rule, value]] of samples.entries()) {
    const path = `drafts/example-${index}.mdx`;
    await writeFile(join(root, path), `---\ntitle: Example\n---\n${value}`);
    const { errors } = await checkRepository(root, { fixture: true });
    assert(errors.some((error) => error.file === path && error.rule === rule), rule);
    assert.equal(JSON.stringify(errors).includes(value), false);
  }
});

test("only named maintainer files are exempt from customer-language rules", async (t) => {
  const { root } = await fixture(t);
  const phrase = ["engineering", "staging"].join(" ");
  await writeFile(join(root, "AGENTS.md"), `Do not show ${phrase} in customer pages.`);
  assert.deepEqual((await checkRepository(root, { fixture: true })).errors, []);
  await mkdir(join(root, "guides"));
  await mkdir(join(root, "scripts"));
  await writeFile(join(root, "guides/AGENTS.md"), phrase);
  await writeFile(join(root, "scripts/unreviewed.mjs"), `// ${phrase}`);
  const { errors } = await checkRepository(root, { fixture: true });
  for (const file of ["guides/AGENTS.md", "scripts/unreviewed.mjs"])
    assert(errors.some((error) => error.file === file && error.rule === "internal-engineering-language"));
});

test("maintainer and fixture paths never bypass credential detection", async (t) => {
  const { root } = await fixture(t);
  const marker = ["github", "pat", "SYNTHETICTESTVALUE"].join("_");
  await mkdir(join(root, "scripts/tests"), { recursive: true });
  for (const file of ["AGENTS.md", "scripts/tests/check-docs.test.mjs"])
    await writeFile(join(root, file), marker);
  const { errors } = await checkRepository(root, { fixture: true });
  for (const file of ["AGENTS.md", "scripts/tests/check-docs.test.mjs"])
    assert(errors.some((error) => error.file === file && error.rule === "credential-pattern"));
  assert.equal(JSON.stringify(errors).includes(marker), false);
});

test("checks decoded JSON and YAML strings, not just their escaped source", async (t) => {
  const { root, docs } = await fixture(t);
  const address = ["admin", "ledig.io"].join("@");
  const text = JSON.stringify({ ...docs, description: address }).replace("@", "\\u0040");
  await writeFile(join(root, "docs.json"), text);
  const host = ["api-staging", "ledig.io"].join(".");
  await replaceSpec(root, sampleSpec.replace("Synthetic example", `"${host.replace(".", "\\u002e")}"`));
  const { errors } = await checkRepository(root, { fixture: true });
  assert(errors.some((error) => error.file === "docs.json" && error.rule === "internal-support-address"));
  assert(errors.some((error) => error.file === "openapi/public.yaml" && error.rule === "internal-environment-host"));
});

test("requires the approved API server list and customer support contact", async (t) => {
  const { root } = await fixture(t);
  await replaceSpec(root, sampleSpec.replace("https://api.ledig.io", "https://example.invalid").replace("support@ledig.io", "help@example.invalid"));
  const { errors } = await checkRepository(root, { fixture: true });
  for (const rule of ["approved-api-servers-required", "customer-support-contact-required"])
    assert(errors.some((error) => error.rule === rule));
});

test("requires explicit success JSON examples rather than renderer placeholders", async (t) => {
  const { root } = await fixture(t);
  await replaceSpec(root, sampleSpec.replace("              example:\n                currency: USD\n                available: '1250.00'\n", ""));
  const { errors } = await checkRepository(root, { fixture: true });
  assert(errors.some((error) => error.rule === "success-response-example-required"));
});

test("allows empty responses without inventing a JSON body", async (t) => {
  const { root } = await fixture(t);
  const noBody = sampleSpec.replace(/        '200':[\s\S]*?components:/, "        '204':\n          description: Removed\ncomponents:");
  await replaceSpec(root, noBody);
  assert.deepEqual((await checkRepository(root, { fixture: true })).errors, []);
});

test("rejects generic examples while preserving string schema types", async (t) => {
  const { root } = await fixture(t);
  assert.deepEqual((await checkRepository(root, { fixture: true })).errors, []);
  await replaceSpec(root, sampleSpec.replace("currency: USD", "currency: string"));
  const { errors } = await checkRepository(root, { fixture: true });
  assert(errors.some((error) => error.rule === "generic-example-placeholder"));
  assert(errors.some((error) => error.rule === "response-example-schema-mismatch"));
});

test("rejects nested generic examples and internal response metadata", async (t) => {
  const { root } = await fixture(t);
  const field = ["provider", "Reference"].join("");
  const extra = `\n      example:\n        rows:\n          - label: '<string>'\n            ${field}: example_record_id\n`;
  await replaceSpec(root, sampleSpec + extra);
  const { errors } = await checkRepository(root, { fixture: true });
  for (const rule of ["generic-example-placeholder", "internal-example-field"])
    assert(errors.some((error) => error.rule === rule));
});

test("signature and timestamp examples must not reuse an API key placeholder", async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, "unlinked.mdx"), "```bash\nx-ledig-signature: <api-key>\nx-ledig-timestamp: YOUR_API_KEY\n```\n");
  const { errors } = await checkRepository(root, { fixture: true });
  assert(errors.some((error) => error.file === "unlinked.mdx" && error.rule === "incorrect-auth-example"));
});

test("keeps decimal strings and required fields consistent with response schemas", async (t) => {
  const { root } = await fixture(t);
  for (const body of ["                currency: USD\n                available: 1250.00", "                currency: USD", "                currency: USDT\n                available: '-10.00'"]) {
    await replaceSpec(root, sampleSpec.replace("                currency: USD\n                available: '1250.00'", body));
    assert((await checkRepository(root, { fixture: true })).errors.some((error) => error.rule === "response-example-schema-mismatch"));
  }
});

test("supports named examples and shared response references", async (t) => {
  const { root } = await fixture(t);
  const named = sampleSpec.replace("              example:\n                currency: USD\n                available: '1250.00'", "              examples:\n                balance:\n                  value:\n                    currency: USD\n                    available: '1250.00'");
  const response = named.match(/        '200':\n([\s\S]*?)components:/)[1];
  const shared = named.replace(/        '200':[\s\S]*?components:/, "        '200':\n          $ref: '#/components/responses/Balance'\ncomponents:") + "  responses:\n    Balance:\n" + response.split("\n").filter(Boolean).map((line) => line.slice(4)).join("\n") + "\n";
  await replaceSpec(root, shared);
  assert.deepEqual((await checkRepository(root, { fixture: true })).errors, []);
});

test("validates nested request examples and conditional schema requirements", async (t) => {
  const { root } = await fixture(t);
  const request = `      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [kind]
              properties:
                kind:
                  type: string
                  enum: [bank, wallet]
                details:
                  type: object
                  required: [currency]
                  properties:
                    currency:
                      type: string
              if:
                properties:
                  kind:
                    const: bank
              then:
                required: [details]
            example:
              kind: bank
`;
  await replaceSpec(root, sampleSpec.replace("      responses:\n", request + "      responses:\n"));
  assert((await checkRepository(root, { fixture: true })).errors.some((error) => error.rule === "request-example-schema-mismatch"));
  await replaceSpec(root, sampleSpec.replace("      responses:\n", request.replace("              kind: bank\n", "              kind: bank\n              details:\n                currency: 42\n") + "      responses:\n"));
  assert((await checkRepository(root, { fixture: true })).errors.some((error) => error.rule === "request-example-schema-mismatch"));
  await replaceSpec(root, sampleSpec.replace("      responses:\n", request.replace("              kind: bank\n", "              kind: bank\n              details:\n                currency: USD\n") + "      responses:\n"));
  assert.deepEqual((await checkRepository(root, { fixture: true })).errors, []);
});

test("rejects unsafe content in escaped nested generated examples", async (t) => {
  const { root } = await fixture(t);
  const host = ["api-staging", "ledig.io"].join(".").replace(".", "\\u002e");
  const value = `"https://${host}"`;
  await replaceSpec(root, sampleSpec + `      example:\n        instructions:\n          - url: ${value}\n`);
  assert((await checkRepository(root, { fixture: true })).errors.some((error) => error.rule === "internal-environment-host"));
});

test("disables automatic request examples so reviewed signing headers are preserved", async (t) => {
  const { root, docs } = await fixture(t);
  for (const value of [true, undefined, "false"]) {
    docs.api.examples.autogenerate = value;
    await writeFile(join(root, "docs.json"), JSON.stringify(docs));
    const { errors } = await checkRepository(root, { fixture: true });
    assert(errors.some((error) => error.rule === "automatic-request-examples-must-remain-disabled"));
  }
});

test("requires non-empty reviewed request samples even for public health operations", async (t) => {
  const { root, docs } = await fixture(t);
  docs.navigation.tabs[0].groups[0].pages[1] = "GET /v1/health";
  await writeFile(join(root, "docs.json"), JSON.stringify(docs));
  const healthSpec = sampleSpec.replaceAll("/v1/example", "/v1/health");
  await replaceSpec(root, healthSpec);
  assert.deepEqual((await checkRepository(root, { fixture: true })).errors, []);
  const sampleBlock = /      x-codeSamples:[\s\S]*?(?=      responses:)/;
  for (const replacement of ["", "      x-codeSamples: []\n", "      x-codeSamples:\n        - lang: JavaScript\n          source: '  '\n", "      x-codeSamples:\n        - source: 'fetch(url)'\n"]) {
    await replaceSpec(root, healthSpec.replace(sampleBlock, replacement));
    const { errors } = await checkRepository(root, { fixture: true });
    assert(errors.some((error) => error.rule === "reviewed-request-code-sample-required"));
  }
});
