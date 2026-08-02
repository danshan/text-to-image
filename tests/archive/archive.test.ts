import { mkdirSync, rmSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mkdtempSync } from "node:fs";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
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
  listRecoveryTransactions,
  markInvocationStarted,
  prepareGeneration,
  readDraft,
  resolveLibrary,
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

  it("archives a successful Generation and refreshes an unchanged Draft", () => {
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
    expect(readDraft(libraryRoot, creation.creation.id).content).toContain("soft side light");
    expectLibraryValid(libraryRoot);
  });

  it("records known failure and interrupted outcomes as immutable Generations", () => {
    const libraryRoot = makeLibrary();
    const creation = createCreation(libraryRoot, { prompt: "A study." });
    const first = prepareGeneration(libraryRoot, creation.creation.id, generationRequest());
    markInvocationStarted(libraryRoot, first.transactionId);
    failGeneration(libraryRoot, first.transactionId, {
      error: { code: "TOOL_UNAVAILABLE", message: "Tool unavailable.", retryable: true },
    });
    expect(commitGeneration(libraryRoot, first.transactionId).generation.status).toBe("failed");

    const second = prepareGeneration(libraryRoot, creation.creation.id, generationRequest());
    markInvocationStarted(libraryRoot, second.transactionId);
    finalizeGenerationInterrupted(libraryRoot, second.transactionId);
    const interrupted = commitGeneration(libraryRoot, second.transactionId).generation;
    expect(interrupted).toMatchObject({
      status: "interrupted",
      outcomeKnown: false,
    });
    expectLibraryValid(libraryRoot);
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

function expectLibraryValid(libraryRoot: string): void {
  const report = validateLibrary(libraryRoot, "full");
  expect(report.diagnostics).toEqual([]);
  expect(report.valid).toBe(true);
}

async function runAssetctl(arguments_: string[]): Promise<{ exitCode: number; value: unknown }> {
  const cli = join(process.cwd(), "apps", "cli", "src", "main.ts");
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", cli, ...arguments_], {
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
