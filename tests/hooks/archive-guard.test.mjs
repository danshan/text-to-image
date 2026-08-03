import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  classifyWritePath,
  evaluatePreToolUse,
  evaluateStop,
  isExactAssetctlCommand,
  resolveLibraryRoot,
} from "../../.codex/hooks/archive-guard.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hookPath = path.join(repositoryRoot, ".codex/hooks/archive-guard.mjs");
let testRoot;
let libraryRoot;
let sourceRoot;

function assertOwnedTempRoot(target) {
  const canonicalTmp = realpathSync(tmpdir());
  const canonicalTarget = realpathSync(target);
  assert.equal(path.dirname(canonicalTarget), canonicalTmp);
  assert.match(path.basename(canonicalTarget), /^text-to-image-hook-/);
}

function preToolFixture(toolName, command, cwd = sourceRoot) {
  return {
    session_id: "session-test",
    turn_id: "turn-test",
    transcript_path: null,
    cwd,
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_use_id: "tool-test",
    tool_input: { command },
    model: "test-model",
    permission_mode: "default",
  };
}

function evaluate(toolName, command, cwd = sourceRoot) {
  return evaluatePreToolUse(preToolFixture(toolName, command, cwd), {
    resolveLibraryRoot: () => libraryRoot,
  });
}

before(() => {
  testRoot = mkdtempSync(path.join(tmpdir(), "text-to-image-hook-"));
  libraryRoot = path.join(testRoot, "external-library");
  sourceRoot = path.join(testRoot, "source");

  mkdirSync(path.join(libraryRoot, "archive/commits"), { recursive: true });
  mkdirSync(path.join(libraryRoot, "assets/sha256/aa"), { recursive: true });
  mkdirSync(path.join(libraryRoot, "creations/creation-1/revisions"), { recursive: true });
  mkdirSync(path.join(libraryRoot, "creations/creation-1/generations"), { recursive: true });
  mkdirSync(path.join(libraryRoot, "inbox"), { recursive: true });
  mkdirSync(path.join(libraryRoot, "curation/images"), { recursive: true });
  mkdirSync(path.join(libraryRoot, ".staging"), { recursive: true });
  mkdirSync(path.join(libraryRoot, ".quarantine"), { recursive: true });
  mkdirSync(path.join(libraryRoot, ".locks"), { recursive: true });
  mkdirSync(sourceRoot, { recursive: true });
  libraryRoot = realpathSync(libraryRoot);
  sourceRoot = realpathSync(sourceRoot);
  writeFileSync(path.join(libraryRoot, "library.json"), '{"formatVersion":1}\n');
  writeFileSync(path.join(sourceRoot, "source.txt"), "source\n");
});

after(() => {
  assertOwnedTempRoot(testRoot);
  rmSync(testRoot, { recursive: true });
});

describe("path classification", () => {
  test("protects every managed Archive area", () => {
    const protectedPaths = [
      "library.json",
      "archive/commits/transaction.json",
      "assets/sha256/aa/aabb.png",
      "creations/creation-1/revisions/revision-1/revision.json",
      "creations/creation-1/generations/generation-1/generation.json",
      "creations/creation-1/prompt-draft.json",
      ".staging/transaction/transaction.json",
      ".quarantine/transaction/transaction.json",
      ".locks/archive.lock",
    ];

    for (const candidate of protectedPaths) {
      assert.equal(
        classifyWritePath({ cwd: libraryRoot, libraryRoot, candidate }).protected,
        true,
        candidate,
      );
    }
  });

  test("allows only draft, inbox, curation, and source writes", () => {
    const allowedPaths = [
      "inbox/reference.png",
      "curation/images/aabb.json",
      "creations/creation-1/prompt-draft.md",
      path.join(sourceRoot, "source.txt"),
    ];

    for (const candidate of allowedPaths) {
      assert.equal(
        classifyWritePath({ cwd: libraryRoot, libraryRoot, candidate }).protected,
        false,
        candidate,
      );
    }
  });

  test("rejects a managed-tree symlink escape", () => {
    const outside = path.join(testRoot, "outside");
    mkdirSync(outside);
    symlinkSync(outside, path.join(libraryRoot, "inbox/link"));

    const result = classifyWritePath({
      cwd: libraryRoot,
      libraryRoot,
      candidate: "inbox/link/file.txt",
    });

    assert.equal(result.protected, true);
    assert.equal(result.reason, "managed_symlink_escape");
  });

  test("protects a canonical external Library through a root symlink", () => {
    const alias = path.join(testRoot, "library-alias");
    symlinkSync(libraryRoot, alias);

    const result = classifyWritePath({
      cwd: testRoot,
      libraryRoot,
      candidate: "library-alias/assets/sha256/aa/aabb.png",
    });

    assert.equal(result.protected, true);
  });

  test("protects an operation targeting an ancestor of the Library", () => {
    const result = classifyWritePath({
      cwd: testRoot,
      libraryRoot,
      candidate: ".",
    });

    assert.equal(result.protected, true);
    assert.equal(result.reason, "library_ancestor");
  });
});

describe("PreToolUse", () => {
  test("allows exact assetctl commands", () => {
    const command = `npm run assetctl -- generation commit --library "${libraryRoot}" --transaction transaction-1`;
    assert.equal(isExactAssetctlCommand(command), true);
    assert.equal(evaluate("Bash", command).allowed, true);
  });

  test("denies direct Bash writes to an external Library", () => {
    const result = evaluate("Bash", `rm "${path.join(libraryRoot, "assets/sha256/aa/aabb.png")}"`);
    assert.equal(result.allowed, false);
    assert.equal(result.output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(result.output.hookSpecificOutput.permissionDecisionReason, /npm run assetctl/);
  });

  test("denies apply_patch writes to managed paths", () => {
    const patchText = `*** Begin Patch\n*** Update File: ${path.join(libraryRoot, "library.json")}\n@@\n-old\n+new\n*** End Patch`;
    assert.equal(evaluate("apply_patch", patchText).allowed, false);
  });

  test("allows apply_patch writes to source and allowed Library areas", () => {
    const sourcePatch =
      "*** Begin Patch\n*** Update File: source.txt\n@@\n-source\n+updated\n*** End Patch";
    const draftPatch = `*** Begin Patch\n*** Add File: ${path.join(libraryRoot, "creations/creation-1/prompt-draft.md")}\n+Draft\n*** End Patch`;
    assert.equal(evaluate("apply_patch", sourcePatch).allowed, true);
    assert.equal(evaluate("apply_patch", draftPatch).allowed, true);
  });

  test("allows simple Bash writes to explicit mutable Library areas", () => {
    assert.equal(
      evaluate("Bash", `touch "${path.join(libraryRoot, "inbox/reference.png")}"`).allowed,
      true,
    );
    assert.equal(
      evaluate("Bash", `touch "${path.join(libraryRoot, "curation/images/aabb.json")}"`).allowed,
      true,
    );
  });

  test("denies ambiguous write-capable shell syntax", () => {
    const result = evaluate("Bash", 'rm "$TARGET" && echo done');
    assert.equal(result.allowed, false);
    assert.match(
      result.output.hookSpecificOutput.permissionDecisionReason,
      /cannot be proven safe/,
    );
  });

  test("denies inline writers and in-place editors", () => {
    assert.equal(evaluate("Bash", 'node -e \'writeFileSync("source.txt", "x")\'').allowed, false);
    assert.equal(evaluate("Bash", "sed -i '' source.txt").allowed, false);
  });

  test("allows copying an archived object out but not copying into Archive", () => {
    const archived = path.join(libraryRoot, "assets/sha256/aa/aabb.png");
    const exported = path.join(sourceRoot, "exported.png");
    assert.equal(evaluate("Bash", `cp "${archived}" "${exported}"`).allowed, true);
    assert.equal(evaluate("Bash", `cp "${exported}" "${archived}"`).allowed, false);
  });

  test("denies move and shell overwrite attempts", () => {
    const managed = path.join(libraryRoot, "archive/commits/direct.json");
    assert.equal(
      evaluate("Bash", `mv "${path.join(sourceRoot, "source.txt")}" "${managed}"`).allowed,
      false,
    );
    assert.equal(evaluate("Bash", `printf data > "${managed}"`).allowed, false);
  });

  test("denies direct git restore of a managed path", () => {
    const result = evaluate("Bash", `git restore "${path.join(libraryRoot, "library.json")}"`);
    assert.equal(result.allowed, false);
  });

  test("denies git clean when the configured Library is below the working tree", () => {
    const nestedLibrary = path.join(sourceRoot, "library");
    mkdirSync(nestedLibrary, { recursive: true });
    const result = evaluatePreToolUse(preToolFixture("Bash", "git clean -fdx", sourceRoot), {
      resolveLibraryRoot: () => nestedLibrary,
    });
    assert.equal(result.allowed, false);
  });

  test("allows non-mutating shell commands without Library resolution", () => {
    const result = evaluatePreToolUse(preToolFixture("Bash", "git status --short"), {
      resolveLibraryRoot: () => {
        throw new Error("unexpected resolver call");
      },
    });
    assert.equal(result.allowed, true);
  });
});

test("production resolution delegates to the assetctl machine contract", () => {
  let invocation;
  const resolved = resolveLibraryRoot({
    cwd: repositoryRoot,
    env: {},
    spawn: (command, args, options) => {
      invocation = { command, args, options };
      return { status: 0, stdout: JSON.stringify({ libraryRoot }), stderr: "" };
    },
  });

  assert.equal(resolved, libraryRoot);
  assert.equal(invocation.command, "npm");
  assert.deepEqual(invocation.args, [
    "run",
    "--silent",
    "assetctl",
    "--",
    "library",
    "resolve",
    "--format",
    "json",
  ]);
  assert.equal(invocation.options.cwd, repositoryRoot);
});

describe("Stop", () => {
  const fixture = {
    cwd: repositoryRoot,
    hook_event_name: "Stop",
    stop_hook_active: false,
  };

  test("continues when read-only validation succeeds", () => {
    const result = evaluateStop(fixture, {
      resolveLibraryRoot: () => libraryRoot,
      runValidator: () => ({ status: 0, stdout: '{"valid":true}\n', stderr: "" }),
    });
    assert.deepEqual(result, { continue: true });
  });

  test("continues the turn with a concise validation failure", () => {
    const result = evaluateStop(fixture, {
      resolveLibraryRoot: () => libraryRoot,
      runValidator: () => ({
        status: 1,
        stdout: '{"code":"ARCHIVE_HASH_MISMATCH","message":"Committed bytes changed."}\n',
        stderr: "ignored secret detail",
      }),
    });
    assert.equal(result.decision, "block");
    assert.match(result.reason, /ARCHIVE_HASH_MISMATCH/);
    assert.doesNotMatch(result.reason, /secret detail/);
  });

  test("allows Stop when the Library is not initialized", () => {
    const result = evaluateStop(fixture, {
      resolveLibraryRoot: () => libraryRoot,
      runValidator: () => ({
        status: 1,
        stdout: JSON.stringify({
          valid: false,
          diagnostics: [
            {
              code: "ARCHIVE_NOT_INITIALIZED",
              severity: "error",
              relativePath: "library.json",
              message: "Library manifest does not exist.",
            },
          ],
        }),
        stderr: "",
      }),
    });
    assert.equal(result.continue, true);
    assert.match(result.systemMessage, /Open Web Settings/);
  });

  test("does not create an infinite continuation loop", () => {
    const result = evaluateStop({ ...fixture, stop_hook_active: true });
    assert.equal(result.continue, true);
    assert.match(result.systemMessage, /will not create a continuation loop/);
  });
});

test("the command hook emits the official deny shape without changing files", () => {
  const before = readFileSync(path.join(libraryRoot, "library.json"), "utf8");
  const input = preToolFixture(
    "Bash",
    `touch "${path.join(libraryRoot, "archive/commits/direct.json")}"`,
    repositoryRoot,
  );
  const result = spawnSync(process.execPath, [hookPath], {
    cwd: repositoryRoot,
    encoding: "utf8",
    input: JSON.stringify(input),
    env: {
      ...process.env,
      TEXT_TO_IMAGE_HOOK_TEST_MODE: "1",
      TEXT_TO_IMAGE_LIBRARY_ROOT: libraryRoot,
    },
  });

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(readFileSync(path.join(libraryRoot, "library.json"), "utf8"), before);
});
