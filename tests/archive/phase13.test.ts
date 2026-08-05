import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBoundedStdin } from "../../apps/cli/src/main.js";
import {
  assertPreparedPromptHash,
  captureGenerationOutput,
  createCreation,
  finalizeGenerationHappyPath,
  initLibrary,
  markInvocationStarted,
  preflightGeneration,
  prepareGeneration,
  readCommitMarkers,
} from "../../packages/archive/src/index.js";
import { readTransaction } from "../../packages/archive/src/transaction.js";
import { ReadModel, catchUpReadModel } from "../../packages/read-model/src/index.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl3sAAAAASUVORK5CYII=",
  "base64",
);

function makeLibrary(): string {
  const root = mkdtempSync(join(tmpdir(), "tti-phase13-"));
  return initLibrary(join(root, "library")).libraryRoot;
}

function generationRequest(prompt = "A quiet study.") {
  return {
    prompt,
    changeInstruction: "",
    references: [],
    tool: { name: "image_gen.imagegen", model: null, parameters: {} },
  };
}

describe("Phase 13 generation contracts", () => {
  it("parses LF-or-EOF framing and rejects oversized or trailing payloads", () => {
    expect(parseBoundedStdin('{"prompt":"line"}\n')).toBe('{"prompt":"line"}');
    expect(parseBoundedStdin('{"prompt":"eof"}')).toBe('{"prompt":"eof"}');
    expect(parseBoundedStdin("x".repeat(1_048_576))).toHaveLength(1_048_576);
    expect(() => parseBoundedStdin(Buffer.from([0xc3, 0x28]))).toThrowError(
      expect.objectContaining({ code: "STDIN_INVALID" }),
    );
    expect(() => parseBoundedStdin("{}\n{}")).toThrowError(
      expect.objectContaining({ code: "STDIN_INVALID" }),
    );
    expect(() => parseBoundedStdin("x".repeat(1_048_577))).toThrowError(
      expect.objectContaining({ code: "STDIN_TOO_LARGE" }),
    );
  });

  it("returns after LF without waiting for EOF in a child process", async () => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx/esm",
        "--eval",
        "import { readBoundedStdin } from './apps/cli/src/main.ts'; process.stdout.write(await readBoundedStdin());",
      ],
      { cwd: join(import.meta.dirname, "../.."), stdio: ["pipe", "pipe", "pipe"] },
    );
    child.stdin.write('{"ok":true}\n');
    const result = await new Promise<string>((resolve, reject) => {
      let output = "";
      let diagnostics = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`child did not return after LF: ${diagnostics}`));
      }, 5_000);
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
        if (!output) return;
        clearTimeout(timer);
        child.kill("SIGTERM");
        child.once("close", () => resolve(output));
      });
      child.stderr.on("data", (chunk: Buffer) => {
        diagnostics += chunk.toString("utf8");
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    expect(result).toBe('{"ok":true}');
    child.stdin.destroy();
  });

  it("keeps generation preflight read-only and exposes source inspections", () => {
    const libraryRoot = makeLibrary();
    try {
      const creation = createCreation(libraryRoot, { prompt: "Draft text" });
      const source = join(libraryRoot, "inbox", "reference.png");
      writeFileSync(source, PNG_1X1);
      const beforeMarkers = readCommitMarkers(libraryRoot).length;
      const beforeStaging = readdirSync(join(libraryRoot, ".staging"));
      const result = preflightGeneration(libraryRoot, creation.creation.id, {
        sessionImagePaths: [source],
      });
      expect(result.libraryRoot).toBe(libraryRoot);
      expect(result.quickValidation).toEqual({ valid: true, mode: "quick" });
      expect(result.sessionImages[0]).toMatchObject({
        sourcePath: source,
        mediaType: "image/png",
        byteLength: PNG_1X1.byteLength,
      });
      expect(readCommitMarkers(libraryRoot)).toHaveLength(beforeMarkers);
      expect(readdirSync(join(libraryRoot, ".staging"))).toEqual(beforeStaging);
    } finally {
      rmSync(join(libraryRoot, ".."), { recursive: true, force: true });
    }
  });

  it("fails the Prompt hash gate before invocation evidence", () => {
    const libraryRoot = makeLibrary();
    try {
      const creation = createCreation(libraryRoot);
      const prepared = prepareGeneration(libraryRoot, creation.creation.id, generationRequest());
      expect(() =>
        assertPreparedPromptHash(libraryRoot, prepared.transactionId, "0".repeat(64)),
      ).toThrowError(expect.objectContaining({ code: "PROMPT_HASH_MISMATCH" }));
      expect(() =>
        markInvocationStarted(libraryRoot, prepared.transactionId, "0".repeat(64)),
      ).toThrowError(expect.objectContaining({ code: "PROMPT_HASH_MISMATCH" }));
      expect(readTransaction(libraryRoot, prepared.transactionId).state).toBe("prepared");
    } finally {
      rmSync(join(libraryRoot, ".."), { recursive: true, force: true });
    }
  });

  it("returns a staged output path and finalizes through the high-level command", () => {
    const libraryRoot = makeLibrary();
    try {
      const creation = createCreation(libraryRoot);
      const source = join(libraryRoot, "inbox", "generated.png");
      writeFileSync(source, PNG_1X1);
      const prepared = prepareGeneration(libraryRoot, creation.creation.id, generationRequest());
      markInvocationStarted(libraryRoot, prepared.transactionId, prepared.promptSha256);
      const captured = captureGenerationOutput(libraryRoot, prepared.transactionId, source);
      expect(captured.stagedPath).toContain(`.staging/${prepared.transactionId}/objects/assets/`);
      expect(existsSync(captured.stagedPath)).toBe(true);
      const result = finalizeGenerationHappyPath(libraryRoot, prepared.transactionId, {
        toolResult: { model: null, parameters: {}, outputCount: 1 },
      });
      expect(result.committed).toBe(true);
      expect(result.generation.status).toBe("succeeded");
      expect(readFileSync(captured.stagedPath)).toEqual(PNG_1X1);
    } finally {
      rmSync(join(libraryRoot, ".."), { recursive: true, force: true });
    }
  });

  it("leaves a valid ready transaction when happy-path commit is interrupted", () => {
    const libraryRoot = makeLibrary();
    try {
      const creation = createCreation(libraryRoot);
      const source = join(libraryRoot, "inbox", "generated.png");
      writeFileSync(source, PNG_1X1);
      const prepared = prepareGeneration(libraryRoot, creation.creation.id, generationRequest());
      markInvocationStarted(libraryRoot, prepared.transactionId);
      captureGenerationOutput(libraryRoot, prepared.transactionId, source);
      expect(() =>
        finalizeGenerationHappyPath(
          libraryRoot,
          prepared.transactionId,
          { toolResult: { model: null, parameters: {}, outputCount: 1 } },
          {
            failpoints: {
              hit(name) {
                if (name === "before_marker_rename") throw new Error("injected finalize failure");
              },
            },
          },
        ),
      ).toThrow("injected finalize failure");
      expect(readTransaction(libraryRoot, prepared.transactionId).state).toBe("ready_to_commit");
      expect(readCommitMarkers(libraryRoot)).toHaveLength(1);
    } finally {
      rmSync(join(libraryRoot, ".."), { recursive: true, force: true });
    }
  });

  it("catches up new markers without rebuilding the existing read model", async () => {
    const libraryRoot = makeLibrary();
    try {
      const first = createCreation(libraryRoot, { title: "First" });
      const readModel = new ReadModel(libraryRoot);
      await readModel.open();
      const cursor = (await readModel.status()).lastIndexedMarker;
      createCreation(libraryRoot, { title: "Second" });
      expect((await readModel.status()).lagCount).toBe(1);
      const result = await readModel.catchUp();
      expect(result.status).toBe("ready");
      expect(result.processed).toBe(1);
      expect((await readModel.status()).lastIndexedMarker).not.toBe(cursor);
      expect(readModel.getCreation(first.creation.id)?.title).toBe("First");
      expect(readModel.listCreations().map((creation) => creation.title)).toContain("Second");
      readModel.close();
    } finally {
      rmSync(join(libraryRoot, ".."), { recursive: true, force: true });
    }
  });

  it("reports degraded projection while retaining the previous atomic marker cursor", async () => {
    const libraryRoot = makeLibrary();
    try {
      const readModel = new ReadModel(libraryRoot);
      await readModel.open();
      const previous = (await readModel.status()).lastIndexedMarker;
      readModel.close();
      createCreation(libraryRoot, { title: "Needs projection" });
      const degraded = await catchUpReadModel(libraryRoot, undefined, {
        onMarker: () => {
          throw new Error("injected projection failure");
        },
      });
      expect(degraded.status).toBe("degraded");
      expect(degraded.code).toBe("INDEX_PROJECTION_FAILED");
      expect(degraded.lagCount).toBe(1);
      expect(degraded.lastIndexedMarker).toBe(previous);
      const recovered = new ReadModel(libraryRoot);
      await recovered.open();
      expect((await recovered.status()).lagCount).toBe(0);
      recovered.close();
    } finally {
      rmSync(join(libraryRoot, ".."), { recursive: true, force: true });
    }
  });
});
