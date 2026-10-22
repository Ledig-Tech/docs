// Guards the public docs repository against content that must never be
// published: retired hosts, legacy operations, internal paths, credential-shaped
// strings and extra OpenAPI documents.
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const errors = [];

const forbidden = [
  { pattern: /sandbox\.ledig\.io/i, reason: "retired sandbox host" },
  { pattern: /(^|[^-\w])api\.ledig\.io/i, reason: "unconfirmed production host" },
  { pattern: /\/internal\//i, reason: "internal route" },
  { pattern: /instant_conversion/i, reason: "legacy operation" },
  { pattern: /Mint Starter Kit/i, reason: "starter content" },
  { pattern: /hi@mintlify\.com/i, reason: "Mintlify contact" },
  { pattern: /dashboard\.mintlify\.com/i, reason: "Mintlify dashboard" },
  { pattern: /mintlify\.com\/blog/i, reason: "Mintlify blog" },
  { pattern: /plant store/i, reason: "starter content" },
  { pattern: /ledig_(sk|pk)_[A-Za-z0-9]{8,}/, reason: "credential-shaped string" },
  { pattern: /sk_live_[A-Za-z0-9]{8,}/, reason: "credential-shaped string" }
];

const allowedSpecs = new Set(["openapi/public.yaml"]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if ([".git", "node_modules", "scripts"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

function checkText(relativePath, text) {
  for (const { pattern, reason } of forbidden) {
    const match = text.match(pattern);
    if (!match) continue;
    const line = text.slice(0, match.index).split("\n").length;
    errors.push(`${relativePath}:${line}: ${reason} — "${match[0]}"`);
  }
}

const files = await walk(root);

for (const file of files) {
  const relativePath = relative(root, file);
  if (!/\.(mdx?|json|ya?ml)$/.test(relativePath)) continue;

  const text = await readFile(file, "utf8");
  checkText(relativePath, text);

  if (/\.ya?ml$/.test(relativePath) && /^openapi:\s*3\./m.test(text) && !allowedSpecs.has(relativePath)) {
    errors.push(`${relativePath}: only openapi/public.yaml may be committed`);
  }

  if (relativePath.endsWith(".json") && relativePath !== "docs.json") {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && "openapi" in parsed) {
        errors.push(`${relativePath}: additional OpenAPI document (only openapi/public.yaml is allowed)`);
      }
    } catch {
      errors.push(`${relativePath}: invalid JSON`);
    }
  }
}

// Every page in navigation must exist.
const docs = JSON.parse(await readFile(join(root, "docs.json"), "utf8"));
const pages = [];
function collect(node) {
  if (!node) return;
  if (Array.isArray(node)) return node.forEach(collect);
  if (typeof node === "string") {
    if (node.includes(" /")) return; // OpenAPI operation reference
    pages.push(node);
    return;
  }
  if (typeof node === "object") {
    if (typeof node.openapi === "string") return;
    if (Array.isArray(node.pages)) node.pages.forEach(collect);
    if (Array.isArray(node.groups)) node.groups.forEach(collect);
    if (Array.isArray(node.tabs)) node.tabs.forEach(collect);
  }
}
collect(docs.navigation);

for (const page of new Set(pages)) {
  const candidates = [join(root, `${page}.mdx`), join(root, page, "index.mdx")];
  const found = await Promise.all(candidates.map(async (path) => {
    try {
      return (await stat(path)).isFile();
    } catch {
      return false;
    }
  }));
  if (!found.some(Boolean)) errors.push(`docs.json: page "${page}" has no ${page}.mdx`);
}

// Redirect destinations must be pages that exist.
for (const redirect of docs.redirects ?? []) {
  const destination = redirect.destination.replace(/^\//, "");
  const candidates = [join(root, `${destination}.mdx`), join(root, destination, "index.mdx")];
  const found = await Promise.all(candidates.map(async (path) => {
    try {
      return (await stat(path)).isFile();
    } catch {
      return false;
    }
  }));
  if (!found.some(Boolean)) errors.push(`docs.json: redirect "${redirect.source}" points to missing "${redirect.destination}"`);
}

if (errors.length > 0) {
  console.error(`docs check failed with ${errors.length} problem(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`docs check passed: ${files.length} files, ${new Set(pages).size} pages, ${docs.redirects?.length ?? 0} redirects.`);
