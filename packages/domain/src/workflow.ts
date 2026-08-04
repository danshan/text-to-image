export const WORKFLOW_STAGES = [
  "Preflight",
  "Reference ingress",
  "Prompt frozen",
  "Waiting for image model",
  "Output captured",
  "Archive committed",
  "Index ready",
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export interface WorkflowStageEvent {
  workflowRunId: string;
  stage: WorkflowStage;
  elapsedMs: number;
  heartbeat: boolean;
}

export interface WorkflowSloResult {
  preToolMs: number | null;
  postToolMs: number | null;
  nonModelOverheadMs: number | null;
  preToolP95Pass: boolean | null;
  postToolP95Pass: boolean | null;
  overheadPass: boolean | null;
}

export interface WorkflowTelemetryInput {
  workflowRunId: string;
  terminalStatus: "succeeded" | "failed" | "interrupted";
  errorCode?: string;
  stages: readonly { stage: WorkflowStage; elapsedMs: number }[];
  preToolMs?: number | null;
  postToolMs?: number | null;
  nonModelOverheadMs?: number | null;
}

export interface WorkflowTelemetry {
  workflowRunId: string;
  terminalStatus: WorkflowTelemetryInput["terminalStatus"];
  errorCode: string | null;
  stages: WorkflowStageEvent[];
  slo: WorkflowSloResult;
}

export class WorkflowProgress {
  readonly #workflowRunId: string;
  readonly #startedAt: number;
  #lastElapsed = 0;
  #lastHeartbeat = 0;
  readonly #events: WorkflowStageEvent[] = [];

  constructor(workflowRunId: string, startedAt = Date.now()) {
    if (!workflowRunId.trim()) throw new Error("workflowRunId is required");
    this.#workflowRunId = workflowRunId;
    this.#startedAt = startedAt;
  }

  stage(stage: WorkflowStage, at = Date.now()): WorkflowStageEvent {
    const event = this.#event(stage, at, false);
    this.#events.push(event);
    return event;
  }

  heartbeat(at = Date.now()): WorkflowStageEvent | null {
    const elapsedMs = this.#elapsed(at);
    if (elapsedMs - this.#lastHeartbeat < 60_000) return null;
    this.#lastHeartbeat = elapsedMs;
    const stage = this.#events.at(-1)?.stage ?? "Preflight";
    const event = this.#event(stage, at, true);
    this.#events.push(event);
    return event;
  }

  telemetry(input: Omit<WorkflowTelemetryInput, "workflowRunId" | "stages">): WorkflowTelemetry {
    return {
      workflowRunId: this.#workflowRunId,
      terminalStatus: input.terminalStatus,
      errorCode: input.errorCode ?? null,
      stages: [...this.#events],
      slo: evaluateWorkflowSlo(input),
    };
  }

  #event(stage: WorkflowStage, at: number, heartbeat: boolean): WorkflowStageEvent {
    return {
      workflowRunId: this.#workflowRunId,
      stage,
      elapsedMs: this.#elapsed(at),
      heartbeat,
    };
  }

  #elapsed(at: number): number {
    this.#lastElapsed = Math.max(this.#lastElapsed, Math.max(0, at - this.#startedAt));
    return this.#lastElapsed;
  }
}

export function evaluateWorkflowSlo(
  input: Pick<WorkflowTelemetryInput, "preToolMs" | "postToolMs" | "nonModelOverheadMs">,
): WorkflowSloResult {
  const preToolMs = boundedDuration(input.preToolMs);
  const postToolMs = boundedDuration(input.postToolMs);
  const nonModelOverheadMs = boundedDuration(input.nonModelOverheadMs);
  return {
    preToolMs,
    postToolMs,
    nonModelOverheadMs,
    preToolP95Pass: preToolMs === null ? null : preToolMs <= 20_000,
    postToolP95Pass: postToolMs === null ? null : postToolMs <= 10_000,
    overheadPass: nonModelOverheadMs === null ? null : nonModelOverheadMs <= 30_000,
  };
}

function boundedDuration(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
