import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const statusValues = new Set(["planned", "draft", "accepted", "deprecated", "superseded"]);
const errors = [];
const ignoredDirectoryNames = new Set([
  ".cache",
  ".git",
  "coverage",
  "dist",
  "library",
  "node_modules",
  "playwright-report",
  "test-results",
]);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectoryNames.has(entry.name) || entry.name.endsWith("-workspace")) continue;
      files.push(...(await walk(path)));
    } else files.push(path);
  }
  return files;
}

function lineOf(content, index) {
  return content.slice(0, index).split("\n").length;
}

function report(path, line, message) {
  errors.push(`${relative(root, path)}:${line}: ${message}`);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function frontmatter(content) {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---\n", 4);
  if (end < 0) return null;
  const fields = new Map();
  for (const line of content.slice(4, end).split("\n")) {
    const match = /^([a-z_]+):\s*(.*)$/u.exec(line);
    if (match) fields.set(match[1], match[2]);
  }
  return fields;
}

async function checkMarkdown(path) {
  const content = await readFile(path, "utf8");
  if (!content.endsWith("\n")) report(path, content.split("\n").length, "missing final newline");
  if (/[，。；：！？（）]/u.test(content)) {
    const index = content.search(/[，。；：！？（）]/u);
    report(path, lineOf(content, index), "use English punctuation in prose");
  }

  if (
    path.includes(`${join("docs", "product")}/`) ||
    path.includes(`${join("docs", "design")}/`) ||
    path.includes(`${join("docs", "development")}/`) ||
    path.includes(`${join("docs", "standards")}/`)
  ) {
    const fields = frontmatter(content);
    if (!fields) report(path, 1, "formal document requires YAML frontmatter");
    else {
      for (const key of ["title", "status", "owner", "last_updated"]) {
        if (!fields.has(key) || !fields.get(key))
          report(path, 1, `frontmatter field is required: ${key}`);
      }
      const status = fields.get("status");
      if (status && !statusValues.has(status))
        report(path, 1, `unknown document status: ${status}`);
    }
  }

  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
    const target = match[1];
    if (!target || /^(?:https?:|mailto:|#)/u.test(target)) continue;
    const clean = target.split("#", 1)[0];
    if (clean && !(await exists(resolve(dirname(path), decodeURIComponent(clean))))) {
      report(path, lineOf(content, match.index ?? 0), `broken relative link: ${target}`);
    }
  }

  for (const match of content.matchAll(/```json\s*\n([\s\S]*?)\n```/gu)) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      report(path, lineOf(content, match.index ?? 0), `invalid JSON fence: ${error.message}`);
    }
  }
}

const markdownFiles = (await walk(root)).filter((path) => path.endsWith(".md"));
for (const path of markdownFiles) await checkMarkdown(path);

const adrFiles = (await readdir(join(root, "docs", "adr")))
  .filter((name) => /^\d{4}-.+\.md$/u.test(name))
  .sort();
for (const [index, name] of adrFiles.entries()) {
  const expected = String(index + 1).padStart(4, "0");
  if (!name.startsWith(`${expected}-`))
    report(join(root, "docs", "adr", name), 1, `expected ADR number ${expected}`);
}

const agents = await readFile(join(root, "AGENTS.md"), "utf8");
for (const match of agents.matchAll(
  /`((?:docs\/|CONTEXT\.md|task_plan\.md|findings\.md|progress\.md)[^`]*)`/gu,
)) {
  const target = match[1];
  if (target.endsWith("/") || target.includes("*")) continue;
  if (!(await exists(join(root, target))))
    report(
      join(root, "AGENTS.md"),
      lineOf(agents, match.index ?? 0),
      `listed path does not exist: ${target}`,
    );
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Validated ${markdownFiles.length} Markdown files and ${adrFiles.length} ADRs.\n`,
  );
}
