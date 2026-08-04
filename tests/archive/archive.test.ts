import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mkdtempSync } from "node:fs";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { run as runAssetctlInProcess } from "../../apps/cli/src/main.js";
import {
  assertReferenceImages,
  captureGenerationOutput,
  checkpointRevision,
  commitGeneration,
  commitTransaction,
  completeGeneration,
  createCreation,
  failGeneration,
  finalizeGenerationInterrupted,
  importImageAsset,
  initLibrary,
  inspectImage,
  inspectImageSource,
  listRecoveryTransactions,
  markInvocationStarted,
  mergeLibrary,
  persistLibrarySelection,
  prepareGeneration,
  readDraft,
  resolveLibrary,
  readCommitMarkers,
  updateCreationCuration,
  updateDraft,
  updateImageCuration,
  validateLibrary,
} from "../../packages/archive/src/index.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl3sAAAAASUVORK5CYII=",
  "base64",
);

const testRoots: string[] = [];

afterEach(() => {
  for (const root of testRoots.splice(0)) {
    const canonicalTemp = resolve(tmpdir());
    const canonicalTarget = resolve(root);
    if (!canonicalTarget.startsWith(`${canonicalTemp}/tti-archive-`)) {
      throw new Error(`Refusing to clean unexpected test path: ${canonicalTarget}`);
    }
    rmSync(canonicalTarget, { recursive: true, force: true });
  }
});

describe("library resolver", () => {
  it("uses CLI, local, tracked, and default precedence relative to Git root", () => {
    const gitRoot = makeTempRoot();
    mkdirSync(join(gitRoot, ".git"));
    writeFileSync(
      join(gitRoot, "text-to-image.config.json"),
      `${JSON.stringify({ library: "./tracked-library" })}\n`,
    );
    writeFileSync(
      join(gitRoot, "text-to-image.local.json"),
      `${JSON.stringify({ library: "./local-library" })}\n`,
    );

    expect(resolveLibrary({ gitRoot }).libraryRoot).toBe(
      join(realpathSync(gitRoot), "local-library"),
    );
    expect(resolveLibrary({ gitRoot, cliPath: "./cli-library" }).libraryRoot).toBe(
      join(realpathSync(gitRoot), "cli-library"),
    );
  });

  it("canonicalizes a Library root symlink", () => {
    const gitRoot = makeTempRoot();
    mkdirSync(join(gitRoot, ".git"));
    const target = join(gitRoot, "external");
    mkdirSync(target);
    symlinkSync(target, join(gitRoot, "library-link"));

    expect(resolveLibrary({ gitRoot, cliPath: "./library-link" }).libraryRoot).toBe(
      realpathSync(target),
    );
  });

  it("persists a canonical local Library selection", () => {
    const gitRoot = makeTempRoot();
    mkdirSync(join(gitRoot, ".git"));
    const libraryRoot = initLibrary(join(gitRoot, "selected-library")).libraryRoot;

    const persisted = persistLibrarySelection(gitRoot, libraryRoot);

    expect(persisted).toEqual({
      configPath: join(realpathSync(gitRoot), "text-to-image.local.json"),
      libraryRoot,
    });
    expect(JSON.parse(readFileSync(persisted.configPath, "utf8"))).toEqual({
      library: libraryRoot,
    });
    expect(resolveLibrary({ gitRoot })).toMatchObject({
      libraryRoot,
      source: "local_config",
    });
  });

  it("persists init and select through the CLI without replacing a valid selection on failure", async () => {
    const gitRoot = makeTempRoot();
    mkdirSync(join(gitRoot, ".git"));
    const firstRoot = join(gitRoot, "first-library");
    const secondRoot = initLibrary(join(gitRoot, "second-library")).libraryRoot;

    const previousCwd = process.cwd();
    process.chdir(gitRoot);
    try {
      expect(
        await runAssetctlInProcess(["init", "--library", firstRoot, "--format", "json"]),
      ).toMatchObject({ exitCode: 0 });
      expect(resolveLibrary({ gitRoot }).libraryRoot).toBe(realpathSync(firstRoot));

      expect(
        await runAssetctlInProcess([
          "library",
          "select",
          "--library",
          secondRoot,
          "--format",
          "json",
        ]),
      ).toMatchObject({ exitCode: 0 });
      expect(resolveLibrary({ gitRoot }).libraryRoot).toBe(secondRoot);

      const sourceRoot = initLibrary(join(gitRoot, "source-library")).libraryRoot;
      createCreation(sourceRoot, { title: "CLI merge source" });
      expect(
        await runAssetctlInProcess([
          "library",
          "merge",
          "--source",
          sourceRoot,
          "--dry-run",
          "--format",
          "json",
        ]),
      ).toMatchObject({
        exitCode: 0,
        value: {
          dryRun: true,
          applied: false,
          imported: { creations: 1 },
        },
      });

      const invalidRoot = join(gitRoot, "invalid-library");
      mkdirSync(invalidRoot);
      await expect(
        runAssetctlInProcess(["library", "select", "--library", invalidRoot, "--format", "json"]),
      ).rejects.toMatchObject({ code: "ARCHIVE_CORRUPTION" });
      expect(resolveLibrary({ gitRoot }).libraryRoot).toBe(secondRoot);
    } finally {
      process.chdir(previousCwd);
    }
  });
});

describe("Library Merge", () => {
  it("merges a fork atomically and preserves destination mutable state", () => {
    const ownerRoot = makeTempRoot();
    const sourceRoot = initLibrary(join(ownerRoot, "source")).libraryRoot;
    const shared = createCreation(sourceRoot, {
      title: "Source title",
      prompt: "Source draft",
    });
    const destinationRoot = join(ownerRoot, "destination");
    cpSync(sourceRoot, destinationRoot, { recursive: true });
    const destinationDraft = readDraft(destinationRoot, shared.creation.id);
    updateDraft(
      destinationRoot,
      shared.creation.id,
      "Destination draft",
      destinationDraft.contentSha256,
    );
    updateCreationCuration(destinationRoot, shared.creation.id, 1, {
      title: "Destination title",
    });
    const importedCreation = createCreation(sourceRoot, {
      title: "Imported creation",
      prompt: "Imported draft",
    });
    const imagePath = join(ownerRoot, "source.png");
    writeFileSync(imagePath, PNG_1X1);
    const importedAsset = importImageAsset(sourceRoot, imagePath);
    const prepared = prepareGeneration(
      sourceRoot,
      importedCreation.creation.id,
      generationRequest(),
    );
    markInvocationStarted(sourceRoot, prepared.transactionId);
    captureGenerationOutput(sourceRoot, prepared.transactionId, imagePath);
    completeGeneration(sourceRoot, prepared.transactionId, {
      toolResult: { model: null, parameters: {}, outputCount: 1 },
    });
    commitGeneration(sourceRoot, prepared.transactionId);
    writeFileSync(join(sourceRoot, "inbox", "ignored.txt"), "ignored\n");

    const preview = mergeLibrary(destinationRoot, sourceRoot, { dryRun: true });

    expect(preview).toMatchObject({
      dryRun: true,
      applied: false,
      imported: { creations: 1, revisions: 1, generations: 1, imageAssets: 1 },
      reused: { creations: 1, revisions: 0, generations: 0, imageAssets: 0 },
      preservedDestinationCuration: 1,
      preservedDestinationDraft: 1,
      ignoredInboxFileCount: 1,
      transactionId: null,
    });
    expect(readCommitMarkers(destinationRoot)).toHaveLength(1);

    const merged = mergeLibrary(destinationRoot, sourceRoot);

    expect(merged.applied).toBe(true);
    expect(merged.transactionId).toMatch(/^[a-f0-9-]{36}$/u);
    expect(
      readCommitMarkers(destinationRoot).find((marker) => marker.id === merged.transactionId)
        ?.operation,
    ).toBe("merge_library");
    expect(readDraft(destinationRoot, shared.creation.id).content).toBe("Destination draft");
    expect(readDraft(destinationRoot, importedCreation.creation.id).content).toBe("Imported draft");
    expect(
      readFileSync(
        join(destinationRoot, "curation", "creations", `${shared.creation.id}.json`),
        "utf8",
      ),
    ).toContain("Destination title");
    expect(
      readFileSync(
        join(
          destinationRoot,
          "assets",
          "sha256",
          importedAsset.assetSha256.slice(0, 2),
          `${importedAsset.assetSha256}.png`,
        ),
      ),
    ).toEqual(PNG_1X1);
    expectLibraryValid(destinationRoot);

    expect(mergeLibrary(destinationRoot, sourceRoot)).toMatchObject({
      applied: false,
      transactionId: null,
    });
  });

  it("rejects the same entity UUID with different immutable content", () => {
    const sourceRoot = makeLibrary();
    const destinationRoot = makeLibrary();
    const creationId = "11111111-1111-4111-8111-111111111111";
    createCreation(
      sourceRoot,
      { id: creationId },
      { adapters: adaptersAt("2026-08-03T01:00:00.000Z") },
    );
    createCreation(
      destinationRoot,
      { id: creationId },
      { adapters: adaptersAt("2026-08-03T02:00:00.000Z") },
    );

    expect(() => mergeLibrary(destinationRoot, sourceRoot)).toThrowError(
      expect.objectContaining({ code: "ARCHIVE_CONFLICT" }),
    );
    expect(readCommitMarkers(destinationRoot)).toHaveLength(1);
  });

  it("keeps an interrupted merge invisible until recovery publishes its Marker", () => {
    const sourceRoot = makeLibrary();
    const destinationRoot = makeLibrary();
    const creation = createCreation(sourceRoot, {
      title: "Recoverable merge",
      prompt: "A staged draft",
    });

    expect(() =>
      mergeLibrary(destinationRoot, sourceRoot, {
        failpoints: {
          hit(name) {
            if (name === "before_marker_rename") throw new Error("injected merge failure");
          },
        },
      }),
    ).toThrow("injected merge failure");
    expect(readCommitMarkers(destinationRoot)).toHaveLength(0);
    const pending = listRecoveryTransactions(destinationRoot).find(
      (transaction) => transaction.operation === "merge_library",
    );
    expect(pending?.state).toBe("ready_to_commit");

    commitTransaction(destinationRoot, pending!.transactionId);

    expect(readDraft(destinationRoot, creation.creation.id).content).toBe("A staged draft");
    expectLibraryValid(destinationRoot);
  });
});

describe("archive vertical slice", () => {
  it("initializes, creates a Creation, checkpoints, and detects Draft conflicts", () => {
    const libraryRoot = makeLibrary();
    const created = createCreation(libraryRoot, {
      title: "Portrait Study",
      prompt: "A quiet portrait.",
    });
    const draft = readDraft(libraryRoot, created.creation.id);
    const updated = updateDraft(
      libraryRoot,
      created.creation.id,
      "A quiet portrait in soft window light.",
      draft.contentSha256,
    );

    expect(() =>
      updateDraft(libraryRoot, created.creation.id, "Stale write", draft.contentSha256),
    ).toThrowError(expect.objectContaining({ code: "DRAFT_CONFLICT" }));

    checkpointRevision(libraryRoot, created.creation.id, {
      prompt: updated.content,
      changeInstruction: "Use softer light.",
    });
    expectLibraryValid(libraryRoot);
  });

  it("imports immutable Image Assets, deduplicates, and updates Curation optimistically", () => {
    const libraryRoot = makeLibrary();
    const creation = createCreation(libraryRoot, { title: "Asset Study" });
    const source = join(dirnameFor(libraryRoot), "input.png");
    writeFileSync(source, PNG_1X1);

    const first = importImageAsset(libraryRoot, source);
    const second = importImageAsset(libraryRoot, source);
    expect(first.reused).toBe(false);
    expect(second).toMatchObject({
      assetSha256: first.assetSha256,
      reused: true,
      transactionId: null,
    });

    const imageCuration = updateImageCuration(libraryRoot, first.assetSha256, 0, {
      favorite: true,
      rating: 4,
      tags: ["candidate", "candidate"],
    });
    expect(imageCuration).toMatchObject({
      entityRevision: 1,
      favorite: true,
      rating: 4,
      tags: ["candidate"],
    });
    expect(() =>
      updateImageCuration(libraryRoot, first.assetSha256, 0, { hidden: true }),
    ).toThrowError(expect.objectContaining({ code: "CURATION_CONFLICT" }));

    const creationCuration = updateCreationCuration(libraryRoot, creation.creation.id, 1, {
      status: "shelved",
    });
    expect(creationCuration.entityRevision).toBe(2);
    expectLibraryValid(libraryRoot);
  });

  it("archives a successful Generation without replacing the unchanged Draft", () => {
    const libraryRoot = makeLibrary();
    const creation = createCreation(libraryRoot, {
      prompt: "A red sphere on linen.",
    });
    const source = join(dirnameFor(libraryRoot), "generated.png");
    writeFileSync(source, PNG_1X1);
    const prepared = prepareGeneration(libraryRoot, creation.creation.id, {
      prompt: "A red sphere on linen, soft side light.",
      changeInstruction: "Use softer side light.",
      references: [],
      tool: {
        name: "image_gen.imagegen",
        model: null,
        parameters: {},
      },
    });

    markInvocationStarted(libraryRoot, prepared.transactionId);
    captureGenerationOutput(libraryRoot, prepared.transactionId, source);
    completeGeneration(libraryRoot, prepared.transactionId, {
      toolResult: { model: null, parameters: {}, outputCount: 1 },
    });
    const committed = commitGeneration(libraryRoot, prepared.transactionId);

    expect(committed.generation.status).toBe("succeeded");
    expect(committed.generation.outputs).toHaveLength(1);
    expect(committed.draftUpdated).toBe(true);
    expect(
      listRecoveryTransactions(libraryRoot).some(
        (transaction) => transaction.transactionId === prepared.transactionId,
      ),
    ).toBe(false);
    expect(readDraft(libraryRoot, creation.creation.id).content).toBe("A red sphere on linen.");
    expectLibraryValid(libraryRoot);
  });

  it("records known failure and interrupted outcomes without replacing the Draft", () => {
    const libraryRoot = makeLibrary();
    const creation = createCreation(libraryRoot, { prompt: "A study." });
    const first = prepareGeneration(libraryRoot, creation.creation.id, generationRequest());
    markInvocationStarted(libraryRoot, first.transactionId);
    failGeneration(libraryRoot, first.transactionId, {
      error: {
        code: "IMAGE_GENERATION_SAFETY_REJECTED",
        message: "The generated result was rejected by safety moderation.",
        retryable: false,
        moderation: { stage: "output", categories: ["sexual"] },
      },
    });
    expect(commitGeneration(libraryRoot, first.transactionId).generation).toMatchObject({
      status: "failed",
      error: {
        code: "IMAGE_GENERATION_SAFETY_REJECTED",
        moderation: { stage: "output", categories: ["sexual"] },
      },
    });
    expect(readDraft(libraryRoot, creation.creation.id).content).toBe("A study.");

    const second = prepareGeneration(libraryRoot, creation.creation.id, generationRequest());
    markInvocationStarted(libraryRoot, second.transactionId);
    finalizeGenerationInterrupted(libraryRoot, second.transactionId);
    const interrupted = commitGeneration(libraryRoot, second.transactionId).generation;
    expect(interrupted).toMatchObject({
      status: "interrupted",
      outcomeKnown: false,
    });
    expect(readDraft(libraryRoot, creation.creation.id).content).toBe("A study.");
    expectLibraryValid(libraryRoot);
  });

  it("rejects unbounded or duplicate moderation categories", () => {
    const libraryRoot = makeLibrary();
    const creation = createCreation(libraryRoot, { prompt: "A study." });
    const prepared = prepareGeneration(libraryRoot, creation.creation.id, generationRequest());
    markInvocationStarted(libraryRoot, prepared.transactionId);

    expect(() =>
      failGeneration(libraryRoot, prepared.transactionId, {
        error: {
          code: "IMAGE_GENERATION_SAFETY_REJECTED",
          message: "Rejected.",
          retryable: false,
          moderation: { stage: "output", categories: ["sexual", "sexual"] },
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "ARCHIVE_SCHEMA_INVALID" }));
  });

  it("keeps pre-marker partial installs invisible and supports idempotent recovery commit", () => {
    const libraryRoot = makeLibrary();
    const creation = createCreation(libraryRoot, { prompt: "A branch." });
    expect(() =>
      checkpointRevision(
        libraryRoot,
        creation.creation.id,
        { prompt: "A branch with leaves." },
        {
          failpoints: {
            hit(name) {
              if (name === "after_object_install:0") {
                throw new Error("injected failure");
              }
            },
          },
        },
      ),
    ).toThrow("injected failure");

    const pending = listRecoveryTransactions(libraryRoot).find(
      (transaction) => transaction.operation === "checkpoint_revision" && !transaction.committed,
    );
    expect(pending?.state).toBe("ready_to_commit");
    expect(validateLibrary(libraryRoot, "full").valid).toBe(false);
    commitTransaction(libraryRoot, pending!.transactionId);
    expectLibraryValid(libraryRoot);
  });

  it("serializes eight process commits and deduplicates a shared Image Asset", async () => {
    const libraryRoot = makeLibrary();
    const source = join(dirnameFor(libraryRoot), "shared.png");
    writeFileSync(source, PNG_1X1);

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        runAssetctl([
          "asset",
          "import",
          "--library",
          libraryRoot,
          "--source",
          source,
          "--format",
          "json",
        ]),
      ),
    );
    expect(results.every((result) => result.exitCode === 0)).toBe(true);
    expectLibraryValid(libraryRoot);
    expect(
      results.filter((result) => (result.value as { reused?: boolean } | null)?.reused === false),
    ).toHaveLength(1);
  });
});

describe("domain and image invariants", () => {
  it("requires guidance when other is the sole Reference role", () => {
    expect(() =>
      assertReferenceImages([{ assetSha256: "a".repeat(64), roles: ["other"] }]),
    ).toThrowError(expect.objectContaining({ code: "ARCHIVE_SCHEMA_INVALID" }));
  });

  it("rejects an extension that conflicts with sniffed bytes", () => {
    expect(() => inspectImage(PNG_1X1, "image.jpg")).toThrowError(
      expect.objectContaining({ code: "IMAGE_INVALID" }),
    );
  });

  it("inspects materialized Image sources without importing them", async () => {
    const ownerRoot = makeTempRoot();
    const source = join(ownerRoot, "session-image.png");
    const unusedLibrary = join(ownerRoot, "unused-library");
    writeFileSync(source, PNG_1X1);

    expect(inspectImageSource(source)).toMatchObject({
      sourcePath: realpathSync(source),
      assetSha256: "18537dc5086d6545f6df54ef124fef79350bf70545a00fd08c48e5490655131a",
      byteLength: PNG_1X1.byteLength,
      mediaType: "image/png",
      width: 1,
      height: 1,
    });
    await expect(
      runAssetctlInProcess([
        "asset",
        "inspect",
        "--library",
        unusedLibrary,
        "--source",
        source,
        "--format",
        "json",
      ]),
    ).resolves.toMatchObject({
      exitCode: 0,
      value: { sourcePath: realpathSync(source), mediaType: "image/png" },
    });
    expect(existsSync(unusedLibrary)).toBe(false);
    const capabilities = await runAssetctlInProcess(["capabilities", "--format", "json"]);
    expect(capabilities.exitCode).toBe(0);
    const commands = (capabilities.value as { commands: string[] }).commands;
    expect(commands).toContain("asset.inspect");
    expect(commands).toContain("asset.import");
    expect(commands).toContain("generation.begin");
    expect(() => inspectImageSource(join(ownerRoot, "missing.png"))).toThrowError(
      expect.objectContaining({ code: "IMAGE_SOURCE_MISSING" }),
    );
    expect(() => inspectImageSource(ownerRoot)).toThrowError(
      expect.objectContaining({ code: "IMAGE_SOURCE_UNREADABLE" }),
    );
  });
});

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tti-archive-"));
  testRoots.push(root);
  return root;
}

function makeLibrary(): string {
  const ownerRoot = makeTempRoot();
  const libraryRoot = join(ownerRoot, "library");
  return initLibrary(libraryRoot).libraryRoot;
}

function dirnameFor(libraryRoot: string): string {
  return resolve(libraryRoot, "..");
}

function generationRequest() {
  return {
    prompt: "A small observational study.",
    changeInstruction: "",
    references: [],
    tool: {
      name: "image_gen.imagegen",
      model: null,
      parameters: {},
    },
  };
}

function adaptersAt(now: string) {
  return {
    now: () => now,
    uuid: () => randomUUID(),
    hostname: () => "localhost",
    pid: process.pid,
  };
}

function expectLibraryValid(libraryRoot: string): void {
  const report = validateLibrary(libraryRoot, "full");
  expect(report.diagnostics).toEqual([]);
  expect(report.valid).toBe(true);
}

async function runAssetctl(arguments_: string[]): Promise<{ exitCode: number; value: unknown }> {
  const cli = join(process.cwd(), "apps", "cli", "src", "main.ts");
  const tsxLoader = createRequire(import.meta.url).resolve("tsx");
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["--import", tsxLoader, cli, ...arguments_], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (!stdout.trim()) {
        reject(new Error(`assetctl produced no JSON. stderr: ${stderr}`));
        return;
      }
      resolvePromise({
        exitCode: code ?? 1,
        value: JSON.parse(stdout) as unknown,
      });
    });
  });
}
