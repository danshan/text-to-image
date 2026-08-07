import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { enterRawStdinMode } from "../../apps/cli/src/main.js";
import {
  beginGeneration,
  createCreation,
  finalizeGenerationHappyPath,
  initLibrary,
  preflightGeneration,
  readCommitMarkers,
  type BeginGenerationRequest,
} from "../../packages/archive/src/index.js";
import { readTransaction } from "../../packages/archive/src/transaction.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl3sAAAAASUVORK5CYII=",
  "base64",
);

describe("Phase 14 Generation Workflow contracts", () => {
  it("enters raw mode for a TTY and restores the previous state", () => {
    const modes: boolean[] = [];
    const stream = {
      isTTY: true,
      isRaw: false,
      setRawMode(mode: boolean) {
        (this as { isRaw: boolean }).isRaw = mode;
        modes.push(mode);
        return this;
      },
    } as unknown as typeof process.stdin;

    const restore = enterRawStdinMode(stream);
    expect(modes).toEqual([true]);
    restore();
    expect(modes).toEqual([true, false]);
  });

  it("begins from inspected Session Images and finalizes generated sources", () => {
    const libraryRoot = makeLibrary();
    try {
      const creation = createCreation(libraryRoot, { prompt: "Draft text" });
      const source = join(libraryRoot, "inbox", "reference.png");
      writeFileSync(source, PNG_1X1);
      const inspection = preflightGeneration(libraryRoot, creation.creation.id, {
        sessionImagePaths: [source],
      }).sessionImages[0]!;
      const request: BeginGenerationRequest = {
        prompt: "Keep the referenced subject stable.",
        changeInstruction: "Use the Session Image as the subject.",
        references: [
          {
            assetSha256: inspection.assetSha256,
            roles: ["subject"],
            guidance: "Preserve subject identity.",
          },
        ],
        sessionImages: [
          {
            sourcePath: inspection.sourcePath,
            expectedAssetSha256: inspection.assetSha256,
          },
        ],
        tool: { name: "fake.generator", model: "deterministic-v1", parameters: {} },
      };

      const begun = beginGeneration(libraryRoot, creation.creation.id, request);
      expect(begun.sessionImages).toEqual([
        expect.objectContaining({ sourceIndex: 0, assetSha256: inspection.assetSha256 }),
      ]);
      expect(readTransaction(libraryRoot, begun.transactionId).state).toBe("invocation_started");

      const finalized = finalizeGenerationHappyPath(libraryRoot, begun.transactionId, {
        outputSources: [source],
        toolResult: { model: "deterministic-v1", parameters: {}, outputCount: 1 },
      });
      expect(finalized.committed).toBe(true);
      expect(finalized.captured).toEqual([
        expect.objectContaining({ index: 0, assetSha256: inspection.assetSha256 }),
      ]);
      expect(finalized.generation).toMatchObject({ status: "succeeded", outcomeKnown: true });
    } finally {
      rmSync(join(libraryRoot, ".."), { recursive: true, force: true });
    }
  });

  it("keeps a committed import when a Session Image changed after Preflight", () => {
    const libraryRoot = makeLibrary();
    try {
      const creation = createCreation(libraryRoot);
      const source = join(libraryRoot, "inbox", "changed.png");
      writeFileSync(source, PNG_1X1);
      const expectedAssetSha256 = "0".repeat(64);
      const request: BeginGenerationRequest = {
        prompt: "A changed reference must fail closed.",
        changeInstruction: "",
        references: [{ assetSha256: expectedAssetSha256, roles: ["subject"] }],
        sessionImages: [{ sourcePath: source, expectedAssetSha256 }],
        tool: { name: "fake.generator", model: null, parameters: {} },
      };

      expect(() => beginGeneration(libraryRoot, creation.creation.id, request)).toThrowError(
        expect.objectContaining({ code: "SESSION_IMAGE_CHANGED" }),
      );
      expect(
        readCommitMarkers(libraryRoot).some((marker) => marker.operation === "import_asset"),
      ).toBe(true);
    } finally {
      rmSync(join(libraryRoot, ".."), { recursive: true, force: true });
    }
  });

  it("runs high-level begin and finalize with correlated truthful telemetry", async () => {
    const libraryRoot = makeLibrary();
    try {
      const creation = createCreation(libraryRoot);
      const source = join(libraryRoot, "inbox", "output.png");
      writeFileSync(source, PNG_1X1);
      const begun = await runAssetctl(
        [
          "generation",
          "begin",
          "--library",
          libraryRoot,
          "--creation",
          creation.creation.id,
          "--request-stdin",
          "--format",
          "json",
        ],
        {
          prompt: "A deterministic CLI workflow.",
          changeInstruction: "",
          references: [],
          tool: { name: "fake.generator", model: "deterministic-v1", parameters: {} },
        },
      );
      const prepared = begun as { transactionId: string };
      const finalized = (await runAssetctl(
        [
          "generation",
          "finalize",
          "--library",
          libraryRoot,
          "--transaction",
          prepared.transactionId,
          "--result-stdin",
          "--format",
          "json",
        ],
        {
          outputSources: [source],
          toolResult: { model: "deterministic-v1", parameters: {}, outputCount: 1 },
          workflowRunId: "phase14-cli-workflow",
          workflowElapsedMsBeforeFinalize: 100,
          preToolMs: 50,
          postToolMsBeforeFinalize: 25,
          nonModelOverheadMs: null,
        },
      )) as {
        committed: boolean;
        generation: { platform: string };
        index: { status: string };
        repositoryTimings: { finalizeAndIndexMs: number };
        telemetry: {
          workflowRunId: string;
          stages: Array<{ elapsedMs: number }>;
          slo: {
            preToolMs: number | null;
            postToolMs: number | null;
            nonModelOverheadMs: number | null;
            overheadPass: boolean | null;
          };
        };
      };
      expect(finalized).toMatchObject({
        committed: true,
        generation: { platform: "openai" },
        index: { status: "ready" },
        telemetry: {
          workflowRunId: "phase14-cli-workflow",
          slo: { preToolMs: 50, nonModelOverheadMs: null, overheadPass: null },
        },
      });
      expect(finalized.telemetry.slo.postToolMs).toBeGreaterThanOrEqual(25);
      expect(finalized.telemetry.stages[0]?.elapsedMs).toBeGreaterThanOrEqual(100);
      expect(finalized.repositoryTimings.finalizeAndIndexMs).toBeGreaterThanOrEqual(0);
    } finally {
      rmSync(join(libraryRoot, ".."), { recursive: true, force: true });
    }
  });
});

function makeLibrary(): string {
  const root = mkdtempSync(join(tmpdir(), "tti-phase14-"));
  return initLibrary(join(root, "library")).libraryRoot;
}

async function runAssetctl(arguments_: string[], input: unknown): Promise<unknown> {
  const cli = join(process.cwd(), "apps", "cli", "src", "main.ts");
  const tsxLoader = createRequire(import.meta.url).resolve("tsx");
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", tsxLoader, cli, ...arguments_], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
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
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`assetctl exited ${code}: ${stderr}`));
        return;
      }
      resolve(JSON.parse(stdout) as unknown);
    });
    child.stdin.end(`${JSON.stringify(input)}\n`);
  });
}
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
