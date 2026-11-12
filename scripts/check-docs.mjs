// Check every committed or proposed public file, not only sidebar pages.
// Findings contain locations and rule names only: a failed check must not leak
// the credential or sensitive text that caused it to fail.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parse } from "yaml";

const METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);
const SPEC_PATH = "openapi/public.yaml";
const SOURCE_PATH = "openapi/source.json";
const TOOL_OUTPUTS = new Set([".git", "node_modules", ".mintlify"]);
const TEXT_EXTENSIONS = new Set([".md", ".mdx", ".json", ".yaml", ".yml", ".mjs", ".js", ".ts", ".svg", ".txt", ".xml", ".toml", ".sh", ".css", ".html"]);
const TEXT_NAMES = new Set(["LICENSE", ".mintignore", ".gitignore", ".gitleaksignore"]);
const FORBIDDEN = [
  { pattern: /sandbox\.ledig\.io/i, rule: "retired-environment-host" },
  { pattern: /(^|[^-\w])api\.ledig\.io/i, rule: "unconfirmed-production-host" },
  { pattern: /\/internal\//i, rule: "internal-route" },
  { pattern: /github\.com\/Ledig-Tech\/ledig-platform(?:[\s/#?)"]|$)/i, rule: "private-source-link" },
  { pattern: /\binstant\x5fconversion\b/i, rule: "retired-operation" },
  { pattern: /Mint\x20Starter\x20Kit|plant\x20store/i, rule: "starter-content" },
  { pattern: /hi@mintlify\.com|dashboard\.mintlify\.com|mintlify\.com\/blog/i, rule: "starter-link" },
  { pattern: /ledig_(?:sk|pk)_[A-Za-z0-9]{8,}|sk_live_[A-Za-z0-9]{8,}/, rule: "credential-pattern" },
  { pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, rule: "private-key" },
  { pattern: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"'<>]+/i, rule: "database-connection" },
];

function finding(file, rule, line = 1) {
  return { file, line, rule };
}

export function scanText(file, text) {
  return FORBIDDEN.flatMap(({ pattern, rule }) => {
    const match = pattern.exec(text);
    return match ? [finding(file, rule, text.slice(0, match.index).split("\n").length)] : [];
  });
}

function publicationFiles(root) {
  // Git includes ignored-but-already-tracked files. An ignored directory must
  // never become a way to hide a committed file from the safety scan.
  return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root })
    .toString("utf8").split("\0").filter(Boolean);
}

async function fixtureFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (TOOL_OUTPUTS.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await fixtureFiles(root, path));
    else files.push(relative(root, path).split(sep).join("/"));
  }
  return files;
}

function safeLocalPath(path) {
  return typeof path === "string" && !/[\u0000-\u001f\u007f]/.test(path) && !path.startsWith("/") && !path.includes("\\") && !path.split("/").some((part) => part === ".." || part === "." || part === "");
}

function jsonPointer(document, reference) {
  if (!reference.startsWith("#/")) return undefined;
  return reference.slice(2).split("/").reduce((value, key) => {
    const decoded = key.replace(/~1/g, "/").replace(/~0/g, "~");
    return value && typeof value === "object" && Object.hasOwn(value, decoded) ? value[decoded] : undefined;
  }, document);
}

function collectReferences(node, visit) {
  if (Array.isArray(node)) node.forEach((value) => collectReferences(value, visit));
  else if (node && typeof node === "object") {
    if (Object.hasOwn(node, "$ref")) visit(node.$ref);
    Object.values(node).forEach((value) => collectReferences(value, visit));
  }
}

function collectNavigation(node, result) {
  if (Array.isArray(node)) return node.forEach((child) => collectNavigation(child, result));
  if (typeof node === "string") {
    if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE) \/\S+$/.test(node)) result.operations.push(node);
    else result.pages.push(node);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (Object.hasOwn(node, "openapi")) result.specs.push(node.openapi);
  // An OpenAPI tab may also contain ordinary introduction pages.
  for (const key of ["tabs", "groups", "pages", "anchors", "dropdowns", "versions", "languages"])
    if (Array.isArray(node[key])) collectNavigation(node[key], result);
}

export async function checkRepository(root, { fixture = false } = {}) {
  const errors = [];
  const contents = new Map();
  const files = [...new Set(fixture ? await fixtureFiles(root) : publicationFiles(root))];
  const add = (file, rule, line = 1) => errors.push(finding(file, rule, line));
  for (const file of files) {
    if (!safeLocalPath(file)) { add("repository", "unsafe-file-path"); continue; }
    if (scanText("repository", file).length) { add("repository", "sensitive-file-name"); continue; }
    if (TOOL_OUTPUTS.has(file.split("/")[0])) { add(file, "committed-tool-output"); continue; }
    const path = join(root, file);
    let info;
    try { info = await lstat(path); } catch { add(file, "missing-file"); continue; }
    if (!info.isFile() || info.isSymbolicLink()) { add(file, "unsupported-file-type"); continue; }
    // New binary assets need explicit review and a scanner that can inspect
    // their format. The current approved brand assets are text SVG files.
    if ((!TEXT_EXTENSIONS.has(extname(file)) && !TEXT_NAMES.has(file)) || info.size > 8 * 1024 * 1024) {
      add(file, "unreviewed-publication-file"); continue;
    }
    let text;
    try {
      const bytes = await readFile(path);
      if (bytes.includes(0)) throw new Error("binary");
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch { add(file, "non-text-publication-file"); continue; }
    contents.set(file, text);
    errors.push(...scanText(file, text));
    if (file.endsWith(".svg") && /<script\b|\bon\w+\s*=|<foreignObject\b/i.test(text)) add(file, "active-svg-content");
    if (/\.ya?ml$/.test(file)) {
      try {
        const parsed = parse(text, { maxAliasCount: 1000 });
        if (file !== SPEC_PATH && parsed && typeof parsed === "object" && (Object.hasOwn(parsed, "openapi") || Object.hasOwn(parsed, "swagger"))) add(file, "extra-api-specification");
      } catch { add(file, "invalid-yaml"); }
    }
    if (file.endsWith(".json")) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && (Object.hasOwn(parsed, "openapi") || Object.hasOwn(parsed, "swagger"))) add(file, "extra-api-specification");
      } catch { add(file, "invalid-json"); }
    }
  }

  let docs, spec, provenance;
  try { docs = JSON.parse(contents.get("docs.json")); } catch { add("docs.json", "missing-or-invalid-configuration"); }
  try { spec = parse(contents.get(SPEC_PATH), { maxAliasCount: 1000 }); } catch { add(SPEC_PATH, "invalid-openapi-yaml"); }
  try { provenance = JSON.parse(contents.get(SOURCE_PATH)); } catch { add(SOURCE_PATH, "missing-or-invalid-provenance"); }

  const navigation = { pages: [], operations: [], specs: [] };
  collectNavigation(docs?.navigation, navigation);
  if (navigation.specs.length !== 1 || navigation.specs[0] !== SPEC_PATH) add("docs.json", "single-public-specification-required");
  if (!["simple", "none"].includes(docs?.api?.playground?.display)) add("docs.json", "interactive-playground-must-remain-disabled");
  const pageExists = (page) => safeLocalPath(page) && [page + ".mdx", page + "/index.mdx"].some((path) => contents.has(path));
  for (const page of navigation.pages) if (!pageExists(page)) add("docs.json", "navigation-page-missing");
  for (const redirect of docs?.redirects ?? []) {
    if (typeof redirect.source !== "string" || !redirect.source.startsWith("/") || typeof redirect.destination !== "string" || !pageExists(redirect.destination.replace(/^\//, ""))) add("docs.json", "redirect-target-missing");
  }

  const operations = [];
  if (!spec || spec.openapi !== "3.1.0" || !spec.paths || typeof spec.paths !== "object") add(SPEC_PATH, "invalid-openapi-document");
  else {
    const securitySchemes = spec.components?.securitySchemes ?? {};
    const checkSecurity = (requirements) => {
      if (!Array.isArray(requirements)) { add(SPEC_PATH, "invalid-security-requirement"); return; }
      for (const requirement of requirements) for (const scheme of Object.keys(requirement ?? {}))
        if (!Object.hasOwn(securitySchemes, scheme)) add(SPEC_PATH, "undefined-security-scheme");
    };
    checkSecurity(spec.security ?? []);
    for (const [path, item] of Object.entries(spec.paths)) {
      if (!path.startsWith("/v1/") || !item || typeof item !== "object") { add(SPEC_PATH, "non-public-operation-path"); continue; }
      for (const [method, operation] of Object.entries(item)) {
        if (!METHODS.has(method)) continue;
        operations.push(method.toUpperCase() + " " + path);
        checkSecurity(operation.security ?? spec.security ?? []);
        if (!operation.responses || Object.keys(operation.responses).length === 0) add(SPEC_PATH, "operation-responses-missing");
      }
    }
    collectReferences(spec, (reference) => {
      if (typeof reference !== "string" || jsonPointer(spec, reference) === undefined) add(SPEC_PATH, "unresolved-or-external-reference");
    });
    if (new Set(navigation.operations).size !== navigation.operations.length) add("docs.json", "duplicate-operation-navigation");
    if (operations.some((operation) => !navigation.operations.includes(operation)) || navigation.operations.some((operation) => !operations.includes(operation))) add("docs.json", "operation-navigation-drift");
  }

  if (provenance) {
    const allowed = new Set(["sourceRevision", "sha256", "operationCount", "deploymentWorkflowRunId"]);
    if (Object.keys(provenance).some((key) => !allowed.has(key)) || !/^[a-f0-9]{40}$/.test(provenance.sourceRevision ?? "") || !/^[a-f0-9]{64}$/.test(provenance.sha256 ?? "") || !Number.isSafeInteger(provenance.operationCount) || provenance.operationCount <= 0 || (provenance.deploymentWorkflowRunId !== undefined && (!Number.isSafeInteger(provenance.deploymentWorkflowRunId) || provenance.deploymentWorkflowRunId <= 0))) add(SOURCE_PATH, "invalid-provenance-fields");
    if (contents.has(SPEC_PATH) && createHash("sha256").update(contents.get(SPEC_PATH)).digest("hex") !== provenance.sha256) add(SOURCE_PATH, "artifact-checksum-mismatch");
    if (provenance.operationCount !== operations.length) add(SOURCE_PATH, "artifact-operation-count-mismatch");
  }
  return { errors, stats: { files: files.length, pages: new Set(navigation.pages).size, operations: operations.length, redirects: docs?.redirects?.length ?? 0 } };
}

export function formatFinding(error) {
  return `${error.file}:${error.line}: ${error.rule}`;
}

async function main() {
  try {
    const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
    const { errors, stats } = await checkRepository(root);
    if (errors.length) {
      console.error(`Docs check failed: ${errors.length} finding(s).`);
      for (const error of errors) console.error(formatFinding(error));
      process.exitCode = 1;
    } else console.log(`Docs check passed: ${stats.files} files, ${stats.pages} pages, ${stats.operations} operations, ${stats.redirects} redirects.`);
  } catch {
    // Parser, filesystem and subprocess errors can include file contents.
    console.error("repository:1: validation-could-not-complete");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
