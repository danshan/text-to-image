import { describe, expect, it } from "vitest";
import { WorkflowProgress, evaluateWorkflowSlo } from "./workflow.js";

describe("WorkflowProgress", () => {
  it("keeps elapsed time monotonic and emits heartbeat only after one minute", () => {
    const progress = new WorkflowProgress("run-1", 1000);
    expect(progress.stage("Preflight", 900).elapsedMs).toBe(0);
    expect(progress.stage("Prompt frozen", 2500).elapsedMs).toBe(1500);
    expect(progress.heartbeat(60_000)).toBeNull();
    expect(progress.heartbeat(61_500)).toMatchObject({
      workflowRunId: "run-1",
      stage: "Prompt frozen",
      elapsedMs: 60_500,
      heartbeat: true,
    });
  });

  it("evaluates bounded repository SLOs without inventing missing timings", () => {
    expect(
      evaluateWorkflowSlo({ preToolMs: 20_000, postToolMs: 10_001, nonModelOverheadMs: null }),
    ).toEqual({
      preToolMs: 20_000,
      postToolMs: 10_001,
      nonModelOverheadMs: null,
      preToolP95Pass: true,
      postToolP95Pass: false,
      overheadPass: null,
    });
  });
});
