import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MUTATING_COMMAND =
  /(^|[\s;&|])(rm|mv|cp|install|mkdir|rmdir|touch|truncate|tee|dd|ln|chmod|chown|rsync|apply_patch)(?=$|\s)/;
const INLINE_WRITER = /(^|\s)(node\s+(?:--eval|-e)|python(?:3)?\s+-c|ruby\s+-e)(?=$|\s)/;
const IN_PLACE_EDITOR = /(^|\s)(sed|perl)\s+(?:[^\s]+\s+)*-(?:[^\s]*i[^\s]*)(?=$|\s)/;
const COMPLEX_SHELL = /[;&|<>`$*?{}\x5b\x5d\n]/;
const REDIRECTION = /(^|[^<])>{1,2}|<{1,2}/;
const ASSETCTL_PREFIXES = [
  ["npm", "run", "assetctl", "--"],
  ["npm", "--silent", "run", "assetctl", "--"],
  ["npm", "run", "--silent", "assetctl", "--"],
];

function jsonLine(value) {
  return `${JSON.stringify(value)}\n`;
}

function deny(reason) {
  return {
    allowed: false,
    output: {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    },
  };
}

function allow() {
  return { allowed: true, output: null };
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function canonicalizeCandidate(candidate) {
  let cursor = path.resolve(candidate);
  const suffix = [];

  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      return path.resolve(candidate);
    }
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }

  return path.join(realpathSync.native(cursor), ...suffix);
}

function allowedLibraryRelativePath(relativePath) {
  const segments = relativePath.split(path.sep).filter(Boolean);

  if (segments[0] === "inbox" || segments[0] === "curation") {
    return true;
  }

  return segments.length === 3 && segments[0] === "creations" && segments[2] === "prompt-draft.md";
}

export function classifyWritePath({ cwd, libraryRoot, candidate }) {
  const lexicalPath = path.resolve(cwd, candidate);
  const canonicalPath = canonicalizeCandidate(lexicalPath);
  const lexicalInside = isWithin(libraryRoot, lexicalPath);
  const canonicalInside = isWithin(libraryRoot, canonicalPath);
  const lexicalContainsLibrary = isWithin(lexicalPath, libraryRoot);
  const canonicalContainsLibrary = isWithin(canonicalPath, libraryRoot);

  if (lexicalContainsLibrary || canonicalContainsLibrary) {
    return { protected: true, reason: "library_ancestor" };
  }

  if (!lexicalInside && !canonicalInside) {
    return { protected: false, reason: "outside_library" };
  }

  if (lexicalInside && !canonicalInside) {
    return { protected: true, reason: "managed_symlink_escape" };
  }

  const relativePath = path.relative(libraryRoot, canonicalPath);
  if (relativePath !== "" && allowedLibraryRelativePath(relativePath)) {
    return { protected: false, reason: "allowed_library_area", relativePath };
  }

  return { protected: true, reason: "managed_archive_area", relativePath };
}

export function tokenizeShellWords(command) {
  const tokens = [];
  let token = "";
  let quote = null;
  let escaping = false;

  for (const character of command) {
    if (escaping) {
      token += character;
      escaping = false;
      continue;
    }

    if (character === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        token += character;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (token.length > 0) {
        tokens.push(token);
        token = "";
      }
      continue;
    }

    token += character;
  }

  if (escaping || quote) {
    return null;
  }

  if (token.length > 0) {
    tokens.push(token);
  }

  return tokens;
}

export function isExactAssetctlCommand(command) {
  if (COMPLEX_SHELL.test(command)) {
    return false;
  }

  const tokens = tokenizeShellWords(command);
  if (!tokens) {
    return false;
  }

  return ASSETCTL_PREFIXES.some(
    (prefix) =>
      tokens.length > prefix.length && prefix.every((token, index) => tokens[index] === token),
  );
}

function looksMutating(command) {
  return (
    MUTATING_COMMAND.test(command) ||
    INLINE_WRITER.test(command) ||
    IN_PLACE_EDITOR.test(command) ||
    REDIRECTION.test(command) ||
    /(^|\s)find(?=$|\s)[\s\S]*\s-delete(?=$|\s)/.test(command) ||
    /(^|\s)git\s+(clean|reset|checkout|restore)(?=$|\s)/.test(command)
  );
}

function candidateTokens(command) {
  const tokens = tokenizeShellWords(command);
  if (!tokens) {
    return [];
  }

  let commandIndex = tokens.findIndex((token) =>
    /^(rm|mv|cp|install|mkdir|rmdir|touch|truncate|tee|dd|ln|chmod|chown|rsync|apply_patch)$/.test(
      token,
    ),
  );

  if (
    commandIndex < 0 &&
    tokens[0] === "git" &&
    /^(clean|reset|checkout|restore)$/.test(tokens[1] || "")
  ) {
    commandIndex = 1;
  }

  if (commandIndex < 0) {
    return tokens
      .filter((token) => token.startsWith("/") || token.startsWith("./") || token.startsWith("../"))
      .map((token) => token.replace(/^(?:of|output|file)=/, ""));
  }

  const commandName = tokens[commandIndex];
  const paths = tokens
    .slice(commandIndex + 1)
    .filter((token) => !token.startsWith("-"))
    .map((token) => token.replace(/^(?:of|output|file)=/, ""));

  if (commandName === "clean" && paths.length === 0) {
    return ["."];
  }

  if (/^(cp|install|ln|rsync)$/.test(commandName)) {
    return paths.slice(-1);
  }

  if (commandName === "dd") {
    return tokens
      .slice(commandIndex + 1)
      .filter((token) => token.startsWith("of="))
      .map((token) => token.slice(3));
  }

  return paths;
}

function extractPatchPaths(patchText) {
  const paths = [];
  const pattern = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm;
  let match;

  while ((match = pattern.exec(patchText)) !== null) {
    paths.push(match[1].trim());
  }

  return paths;
}

function discoverRepositoryRoot(cwd) {
  let cursor = path.resolve(cwd);

  while (true) {
    if (existsSync(path.join(cursor, ".git"))) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      throw new Error("Repository root could not be resolved.");
    }
    cursor = parent;
  }
}

export function resolveLibraryRoot({ cwd, env = process.env, spawn = spawnSync }) {
  if (env.TEXT_TO_IMAGE_HOOK_TEST_MODE === "1" && env.TEXT_TO_IMAGE_LIBRARY_ROOT) {
    return canonicalizeCandidate(path.resolve(cwd, env.TEXT_TO_IMAGE_LIBRARY_ROOT));
  }

  const repositoryRoot = discoverRepositoryRoot(cwd);
  const result = spawn(
    "npm",
    ["run", "--silent", "assetctl", "--", "library", "resolve", "--format", "json"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 8_000,
      env,
    },
  );

  if (result.error || result.status !== 0) {
    throw new Error("The shared Asset Library resolver is unavailable.");
  }

  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new Error("The shared Asset Library resolver returned invalid JSON.");
  }

  if (!payload || typeof payload.libraryRoot !== "string" || payload.libraryRoot.length === 0) {
    throw new Error("The shared Asset Library resolver omitted libraryRoot.");
  }

  return canonicalizeCandidate(payload.libraryRoot);
}

function evaluatePaths({ paths, cwd, libraryRoot }) {
  for (const candidate of paths) {
    const classification = classifyWritePath({ cwd, libraryRoot, candidate });
    if (classification.protected) {
      const displayPath = classification.relativePath || candidate;
      return deny(
        `Direct writes to managed Asset Library path '${displayPath}' are blocked. Use 'npm run assetctl -- ...' so the Archive transaction and Commit Marker remain valid.`,
      );
    }
  }

  return allow();
}

export function evaluatePreToolUse(input, dependencies = {}) {
  const command = input?.tool_input?.command;
  const cwd = input?.cwd;

  if (typeof command !== "string" || typeof cwd !== "string") {
    return deny(
      "The hook could not analyze this write request. Use 'npm run assetctl -- ...' for Asset Library changes.",
    );
  }

  if (input.tool_name === "Bash" && isExactAssetctlCommand(command)) {
    return allow();
  }

  if (input.tool_name === "Bash" && !looksMutating(command)) {
    return allow();
  }

  if (
    input.tool_name === "Bash" &&
    (COMPLEX_SHELL.test(command) || INLINE_WRITER.test(command) || IN_PLACE_EDITOR.test(command))
  ) {
    return deny(
      "A write-capable shell command with indirection or compound syntax cannot be proven safe. Use a simple source-tree command or 'npm run assetctl -- ...' for Asset Library changes.",
    );
  }

  let libraryRoot;
  try {
    libraryRoot = (dependencies.resolveLibraryRoot || resolveLibraryRoot)({
      cwd,
      env: dependencies.env || process.env,
      spawn: dependencies.spawn || spawnSync,
    });
  } catch (error) {
    return deny(
      `${error instanceof Error ? error.message : "Asset Library resolution failed"} Refusing a write-capable operation until the canonical root is known.`,
    );
  }

  if (input.tool_name === "apply_patch") {
    const paths = extractPatchPaths(command);
    if (paths.length === 0) {
      return deny(
        "The apply_patch target could not be resolved. Use a standard patch with explicit file paths.",
      );
    }
    return evaluatePaths({ paths, cwd, libraryRoot });
  }

  if (input.tool_name === "Bash") {
    return evaluatePaths({ paths: candidateTokens(command), cwd, libraryRoot });
  }

  return allow();
}

function conciseValidatorFailure(result) {
  const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
  if (stdout) {
    try {
      const payload = JSON.parse(stdout);
      const code = typeof payload.code === "string" ? payload.code : "ASSET_LIBRARY_INVALID";
      const message = typeof payload.message === "string" ? payload.message : "Validation failed.";
      return `${code}: ${message}`.slice(0, 500);
    } catch {
      return "ASSET_LIBRARY_INVALID: Validator returned a non-JSON diagnostic.";
    }
  }
  return "ASSET_LIBRARY_INVALID: Read-only validation failed.";
}

export function runReadOnlyValidator({ cwd, libraryRoot, env = process.env, spawn = spawnSync }) {
  const repositoryRoot = discoverRepositoryRoot(cwd);
  return spawn(
    "npm",
    ["run", "--silent", "assetctl", "--", "validate", "--library", libraryRoot, "--format", "json"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 25_000,
      env,
    },
  );
}

export function evaluateStop(input, dependencies = {}) {
  if (input?.stop_hook_active) {
    return {
      continue: true,
      systemMessage:
        "Asset Library validation is still failing; the Stop hook will not create a continuation loop.",
    };
  }

  const cwd = input?.cwd;
  if (typeof cwd !== "string") {
    return {
      decision: "block",
      reason: "Resolve the working directory and rerun Asset Library validation.",
    };
  }

  let libraryRoot;
  try {
    libraryRoot = (dependencies.resolveLibraryRoot || resolveLibraryRoot)({
      cwd,
      env: dependencies.env || process.env,
      spawn: dependencies.spawn || spawnSync,
    });
  } catch (error) {
    return {
      decision: "block",
      reason: `${error instanceof Error ? error.message : "Asset Library resolution failed"} Run 'npm run assetctl -- library resolve --format json' and correct the configuration.`,
    };
  }

  const result = (dependencies.runValidator || runReadOnlyValidator)({
    cwd,
    libraryRoot,
    env: dependencies.env || process.env,
    spawn: dependencies.spawn || spawnSync,
  });

  if (!result.error && result.status === 0) {
    return { continue: true };
  }

  return {
    decision: "block",
    reason: `${conciseValidatorFailure(result)} Run 'npm run assetctl -- validate --library "${libraryRoot}" --format json' and fix the reported integrity issue without editing Archive files directly.`,
  };
}

async function readHookInput() {
  let source = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    source += chunk;
    if (source.length > 1_048_576) {
      throw new Error("Hook input exceeds the 1 MiB limit.");
    }
  }
  return JSON.parse(source);
}

async function main() {
  const input = await readHookInput();

  if (input.hook_event_name === "PreToolUse") {
    const result = evaluatePreToolUse(input);
    if (!result.allowed) {
      process.stdout.write(jsonLine(result.output));
    }
    return;
  }

  if (input.hook_event_name === "Stop") {
    process.stdout.write(jsonLine(evaluateStop(input)));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
