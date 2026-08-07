import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, test } from "vitest";
import { WorkflowProgress } from "@text-to-image/domain";
import {
  beginGeneration,
  createCreation,
  finalizeGenerationHappyPath,
  initLibrary,
  preflightGeneration,
  validateLibrary,
} from "@text-to-image/archive";
import { ReadModel } from "@text-to-image/read-model";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl3sAAAAASUVORK5CYII=",
  "base64",
);

interface DurationStats {
  p50: number;
  p95: number;
  max: number;
}

interface WorkflowSample {
  preToolMs: number;
  postToolMs: number;
  nonModelOverheadMs: number;
}

describe("deterministic fake generation workflow SLO", () => {
  test("measures the complete archive and index path", async () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "text-to-image-workflow-performance-"));
    const libraryRoot = initLibrary(join(temporaryRoot, "library")).libraryRoot;
    const creation = createCreation(libraryRoot, {
      title: "Workflow performance fixture",
      prompt: "A deterministic fake generation fixture.",
    });
    const generatedPath = join(libraryRoot, "inbox", "fake-output.png");
    writeFileSync(generatedPath, PNG_1X1);
    const readModel = new ReadModel(libraryRoot);
    const samples: WorkflowSample[] = [];
    try {
      await readModel.open();
      for (let index = 0; index < 12; index += 1) {
        const workflowStartedAt = performance.now();
        const progress = new WorkflowProgress(`fake-workflow-${index}`);
        progress.stage("Preflight");
        const preflight = preflightGeneration(libraryRoot, creation.creation.id, {
          sessionImagePaths: [generatedPath],
        });
        expect(preflight.sessionImages[0]?.assetSha256).toBeDefined();
        progress.stage("Prompt frozen");
        const prepared = beginGeneration(libraryRoot, creation.creation.id, {
          prompt: "A deterministic fake generation fixture.",
          changeInstruction: "",
          references: [],
          provider: "openai",
          tool: { name: "fake.generator", model: "deterministic-v1", parameters: {} },
        });
        progress.stage("Waiting for image model");
        const toolReturnedAt = performance.now();

        const finalized = finalizeGenerationHappyPath(libraryRoot, prepared.transactionId, {
          outputSources: [generatedPath],
          toolResult: { model: "deterministic-v1", parameters: {}, outputCount: 1 },
        });
        expect(finalized.captured).toHaveLength(1);
        progress.stage("Output captured");
        expect(finalized.committed).toBe(true);
        progress.stage("Archive committed");
        const indexResult = await readModel.catchUp();
        expect(indexResult.status).toBe("ready");
        const validation = validateLibrary(libraryRoot, "full");
        expect(validation.valid).toBe(true);
        progress.stage("Index ready");

        const completedAt = performance.now();
        const sample = {
          preToolMs: toolReturnedAt - workflowStartedAt,
          postToolMs: completedAt - toolReturnedAt,
          nonModelOverheadMs: completedAt - workflowStartedAt,
        };
        samples.push(sample);
        const telemetry = progress.telemetry({
          terminalStatus: "succeeded",
          ...sample,
        });
        expect(telemetry.slo.preToolP95Pass).toBe(true);
        expect(telemetry.slo.postToolP95Pass).toBe(true);
        expect(telemetry.slo.overheadPass).toBe(true);
        expect(telemetry.stages.map((event) => event.stage)).toEqual([
          "Preflight",
          "Prompt frozen",
          "Waiting for image model",
          "Output captured",
          "Archive committed",
          "Index ready",
        ]);
        expect(telemetry).not.toHaveProperty("percent");
        expect(telemetry).not.toHaveProperty("eta");
      }

      const preTool = summarize(samples.map((sample) => sample.preToolMs));
      const postTool = summarize(samples.map((sample) => sample.postToolMs));
      const nonModelOverhead = summarize(samples.map((sample) => sample.nonModelOverheadMs));
      console.info("Generation workflow performance", {
        iterations: samples.length,
        preTool,
        postTool,
        nonModelOverhead,
      });
      expect(preTool.p95).toBeLessThanOrEqual(20_000);
      expect(postTool.p95).toBeLessThanOrEqual(10_000);
      expect(nonModelOverhead.p95).toBeLessThanOrEqual(30_000);
    } finally {
      readModel.close();
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }, 60_000);
});

function summarize(values: number[]): DurationStats {
  const ordered = [...values].sort((left, right) => left - right);
  const percentile = (ratio: number): number => {
    const position = Math.min(
      ordered.length - 1,
      Math.max(0, Math.ceil(ordered.length * ratio) - 1),
    );
    return ordered[position] ?? Number.POSITIVE_INFINITY;
  };
  return {
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: ordered.at(-1) ?? Number.POSITIVE_INFINITY,
  };
}
