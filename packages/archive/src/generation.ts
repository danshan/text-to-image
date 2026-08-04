import { readFileSync, realpathSync } from "node:fs";
import {
  ArchiveError,
  assertReferenceImages,
  assertGenerationError,
  type GenerationErrorRecord,
  type GenerationOutput,
  type GenerationRecord,
  type ReferenceImage,
} from "@text-to-image/domain";
import { inspectImage } from "./image.js";
import { defaultRuntimeAdapters, readJson, resolveManagedPath, sha256Bytes } from "./internal.js";
import {
  commitTransaction,
  createTransaction,
  patchTransaction,
  readTransaction,
  stageRecordBytes,
  stageRecordJson,
  transitionTransaction,
  type TransactionOptions,
} from "./transaction.js";
import {
  assertCreationCommitted,
  assertRevisionCommitted,
  findAssetRelativePath,
  importImageAsset,
  readDraft,
  updateDraft,
  type ImportAssetResult,
} from "./writer.js";
import { assertLibraryValid, assertRecordSchema, readCommittedPathIndex } from "./validator.js";
import { listRecoveryTransactions, type RecoverySummary } from "./recovery.js";
import { inspectImageSource, type ImageSourceInspection } from "./image-source.js";

export interface PrepareGenerationRequest {
  prompt: string;
  changeInstruction: string;
  basedOnRevisionId?: string | null;
  references: ReferenceImage[];
  replayOfGenerationId?: string | null;
  tool: {
    name: string;
    model: string | null;
    parameters: Record<string, unknown>;
  };
}

export interface PrepareGenerationResult {
  transactionId: string;
  revisionId: string;
  generationId: string;
  promptSha256: string;
  referencePaths: string[];
}

export interface BeginGenerationRequest extends PrepareGenerationRequest {
  sessionImages?: Array<{
    sourcePath: string;
    expectedAssetSha256: string;
  }>;
}

export interface BeginGenerationResult extends PrepareGenerationResult {
  sessionImages: Array<ImportAssetResult & { sourceIndex: number }>;
}

export interface GenerationPreflightRequest {
  sessionImagePaths?: string[];
  references?: ReferenceImage[];
  basedOnRevisionId?: string | null;
}

export interface GenerationPreflightResult {
  libraryRoot: string;
  capabilities: {
    libraryFormat: 1;
    generationWorkflowVersion: 1;
  };
  creationId: string;
  quickValidation: { valid: true; mode: "quick" };
  draft: {
    content: string;
    contentSha256: string;
    metadata: ReturnType<typeof readDraft>["metadata"];
  };
  recovery: {
    pending: RecoverySummary[];
    warning: boolean;
  };
  sessionImages: ImageSourceInspection[];
  sessionImageInspections: ImageSourceInspection[];
  recoveryWarning: boolean;
}

export interface CaptureGenerationResult extends GenerationOutput {
  relativePath: string;
  stagedPath: string;
  stagedOutputPath: string;
}

export interface FinalizeGenerationRequest {
  outcome?: "succeeded" | "failed";
  toolResult?: CompleteGenerationRequest["toolResult"];
  error?: FailGenerationRequest["error"];
  outputSources?: string[];
}

export interface CompleteGenerationRequest {
  toolResult: {
    model: string | null;
    parameters: Record<string, unknown>;
    outputCount: number;
  };
}

export interface FailGenerationRequest {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    moderation?: {
      stage: "input" | "output" | "unknown";
      categories: string[];
    };
  };
}

export function prepareGeneration(
  libraryRoot: string,
  creationId: string,
  request: PrepareGenerationRequest,
  options: TransactionOptions = {},
): PrepareGenerationResult {
  assertCreationCommitted(libraryRoot, creationId);
  assertReferenceImages(request.references);
  if (!request.prompt.trim()) {
    throw new ArchiveError("ARCHIVE_SCHEMA_INVALID", "Effective Prompt must not be empty.");
  }
  const adapters = options.adapters ?? defaultRuntimeAdapters;
  const draft = readDraft(libraryRoot, creationId);
  const parentRevisionId =
    request.basedOnRevisionId === undefined
      ? draft.metadata.basedOnRevisionId
      : request.basedOnRevisionId;
  if (parentRevisionId) {
    assertRevisionCommitted(libraryRoot, creationId, parentRevisionId);
  }
  if (request.replayOfGenerationId) {
    assertGenerationCommitted(libraryRoot, creationId, request.replayOfGenerationId);
  }
  const referencePaths = request.references.map((reference) => {
    const relativePath = findAssetRelativePath(libraryRoot, reference.assetSha256);
    const absolutePath = resolveManagedPath(libraryRoot, relativePath);
    if (sha256Bytes(readFileSync(absolutePath)) !== reference.assetSha256) {
      throw new ArchiveError(
        "ARCHIVE_HASH_MISMATCH",
        "Reference Image payload does not match its content identity.",
        { assetSha256: reference.assetSha256 },
      );
    }
    return absolutePath;
  });

  const revisionId = adapters.uuid();
  const generationId = adapters.uuid();
  const transaction = createTransaction(
    libraryRoot,
    {
      operation: "generation",
      creationId,
      revisionId,
      generationId,
      draftContentSha256: draft.contentSha256,
      request: {
        prompt: request.prompt,
        promptSha256: sha256Bytes(request.prompt),
        changeInstruction: request.changeInstruction,
        references: request.references,
        replayOfGenerationId: request.replayOfGenerationId ?? null,
        tool: request.tool,
        outputs: [],
        startedAt: null,
      },
    },
    options,
  );
  const revision = {
    schemaVersion: 1 as const,
    id: revisionId,
    creationId,
    parentRevisionId,
    changeInstruction: request.changeInstruction,
    promptSha256: sha256Bytes(request.prompt),
    createdAt: adapters.now(),
  };
  const base = `creations/${creationId}/revisions/${revisionId}`;
  stageRecordBytes(
    libraryRoot,
    transaction.id,
    "prompt",
    `${base}/prompt.md`,
    Buffer.from(request.prompt, "utf8"),
    options,
  );
  stageRecordJson(
    libraryRoot,
    transaction.id,
    "revision",
    `${base}/revision.json`,
    revision,
    options,
  );
  return {
    transactionId: transaction.id,
    revisionId,
    generationId,
    promptSha256: revision.promptSha256,
    referencePaths,
  };
}

export function beginGeneration(
  libraryRoot: string,
  creationId: string,
  request: BeginGenerationRequest,
  options: TransactionOptions = {},
): BeginGenerationResult {
  assertReferenceImages(request.references);
  if (!request.prompt.trim()) {
    throw new ArchiveError("ARCHIVE_SCHEMA_INVALID", "Effective Prompt must not be empty.");
  }
  const referencedAssets = new Set(request.references.map((reference) => reference.assetSha256));
  for (const sessionImage of request.sessionImages ?? []) {
    if (!referencedAssets.has(sessionImage.expectedAssetSha256)) {
      throw new ArchiveError(
        "ARCHIVE_SCHEMA_INVALID",
        "Every Session Image must be present in the Generation references.",
        { expectedAssetSha256: sessionImage.expectedAssetSha256 },
      );
    }
  }
  const sessionImages = (request.sessionImages ?? []).map((sessionImage, sourceIndex) => {
    const imported = importImageAsset(libraryRoot, sessionImage.sourcePath, options);
    if (imported.assetSha256 !== sessionImage.expectedAssetSha256) {
      throw new ArchiveError("SESSION_IMAGE_CHANGED", "Session Image changed after Preflight.", {
        sourceIndex,
        expectedAssetSha256: sessionImage.expectedAssetSha256,
        actualAssetSha256: imported.assetSha256,
      });
    }
    return { sourceIndex, ...imported };
  });
  const prepared = prepareGeneration(libraryRoot, creationId, request, options);
  markInvocationStarted(libraryRoot, prepared.transactionId, prepared.promptSha256, options);
  return { ...prepared, sessionImages };
}

export function preflightGeneration(
  libraryRootInput: string,
  creationId: string,
  request: GenerationPreflightRequest = {},
): GenerationPreflightResult {
  const libraryRoot = realpathSync(libraryRootInput);
  assertLibraryValid(libraryRoot, "quick");
  assertCreationCommitted(libraryRoot, creationId);
  if (request.basedOnRevisionId) {
    assertRevisionCommitted(libraryRoot, creationId, request.basedOnRevisionId);
  }
  if (request.references) {
    assertReferenceImages(request.references);
    for (const reference of request.references) {
      const relativePath = findAssetRelativePath(libraryRoot, reference.assetSha256);
      const bytes = readFileSync(resolveManagedPath(libraryRoot, relativePath));
      if (sha256Bytes(bytes) !== reference.assetSha256) {
        throw new ArchiveError(
          "ARCHIVE_HASH_MISMATCH",
          "Reference Image payload does not match its content identity.",
          { assetSha256: reference.assetSha256 },
        );
      }
    }
  }
  const draft = readDraft(libraryRoot, creationId);
  const pending = listRecoveryTransactions(libraryRoot);
  const sessionImages = (request.sessionImagePaths ?? []).map((sourcePath) =>
    inspectImageSource(sourcePath),
  );
  return {
    libraryRoot,
    capabilities: { libraryFormat: 1, generationWorkflowVersion: 1 },
    creationId,
    quickValidation: { valid: true, mode: "quick" },
    draft,
    recovery: { pending, warning: pending.length > 0 },
    sessionImages,
    sessionImageInspections: sessionImages,
    recoveryWarning: pending.length > 0,
  };
}

export function assertPromptHash(prompt: string, expectedSha256: string): void {
  const actualSha256 = sha256Bytes(Buffer.from(prompt, "utf8"));
  if (actualSha256 !== expectedSha256) {
    throw new ArchiveError(
      "PROMPT_HASH_MISMATCH",
      "Effective Prompt bytes do not match the expected SHA-256 digest.",
      { expectedSha256, actualSha256 },
    );
  }
}

export function assertPreparedPromptHash(
  libraryRoot: string,
  transactionId: string,
  expectedSha256: string,
): void {
  const transaction = readTransaction(libraryRoot, transactionId);
  assertGenerationTransaction(transaction.operation, transactionId);
  const promptRecord = transaction.stagedRecords.find(
    (record) => record.kind === "prompt" && record.path.endsWith("/prompt.md"),
  );
  if (!promptRecord) {
    throw new ArchiveError("ARCHIVE_CORRUPTION", "Generation transaction has no staged Prompt.", {
      transactionId,
    });
  }
  const promptBytes = readFileSync(
    stagedRecordPathForPrompt(libraryRoot, transactionId, promptRecord.path),
  );
  const actualSha256 = sha256Bytes(promptBytes);
  const storedSha256 = transaction.request.promptSha256;
  if (
    actualSha256 !== expectedSha256 ||
    actualSha256 !== promptRecord.sha256 ||
    (typeof storedSha256 === "string" && storedSha256 !== expectedSha256)
  ) {
    throw new ArchiveError(
      "PROMPT_HASH_MISMATCH",
      "Prepared Prompt bytes do not match the invocation SHA-256 gate.",
      { expectedSha256, actualSha256, stagedSha256: promptRecord.sha256, storedSha256 },
    );
  }
}

export function markInvocationStarted(
  libraryRoot: string,
  transactionId: string,
  expectedPromptSha256OrOptions: string | TransactionOptions = {},
  options: TransactionOptions = {},
): void {
  const expectedPromptSha256 =
    typeof expectedPromptSha256OrOptions === "string" ? expectedPromptSha256OrOptions : undefined;
  const transactionOptions =
    typeof expectedPromptSha256OrOptions === "string" ? options : expectedPromptSha256OrOptions;
  const transaction = readTransaction(libraryRoot, transactionId);
  assertGenerationTransaction(transaction.operation, transactionId);
  if (expectedPromptSha256) {
    assertPreparedPromptHash(libraryRoot, transactionId, expectedPromptSha256);
  }
  transitionTransaction(
    libraryRoot,
    transactionId,
    "invocation_started",
    { startedAt: (transactionOptions.adapters ?? defaultRuntimeAdapters).now() },
    transactionOptions,
  );
}

export function captureGenerationOutput(
  libraryRoot: string,
  transactionId: string,
  sourcePath: string,
  options: TransactionOptions = {},
): CaptureGenerationResult {
  let transaction = readTransaction(libraryRoot, transactionId);
  assertGenerationTransaction(transaction.operation, transactionId);
  if (transaction.state !== "invocation_started" && transaction.state !== "outputs_captured") {
    throw new ArchiveError(
      "TRANSACTION_INVALID_STATE",
      "Output can only be captured after invocation starts.",
      { transactionId, state: transaction.state },
    );
  }
  const bytes = readFileSync(sourcePath);
  const inspection = inspectImage(bytes, sourcePath);
  const assetSha256 = sha256Bytes(bytes);
  const relativePath = `assets/sha256/${assetSha256.slice(0, 2)}/${assetSha256}.${inspection.extension}`;
  stageRecordBytes(libraryRoot, transactionId, "image_asset", relativePath, bytes, options);
  options.failpoints?.hit("after_payload_flush");

  transaction = readTransaction(libraryRoot, transactionId);
  const outputs = readOutputs(transaction.request.outputs);
  const output: GenerationOutput = {
    index: outputs.length,
    assetSha256,
    mediaType: inspection.mediaType,
    width: inspection.width,
    height: inspection.height,
  };
  outputs.push(output);
  if (transaction.state === "invocation_started") {
    transitionTransaction(libraryRoot, transactionId, "outputs_captured", { outputs }, options);
  } else {
    patchTransaction(libraryRoot, transactionId, { request: { outputs } }, options);
  }
  const stagedPath = resolveManagedPath(
    libraryRoot,
    `.staging/${transactionId}/objects/${relativePath}`,
  );
  return {
    ...output,
    relativePath,
    stagedPath,
    stagedOutputPath: stagedPath,
  };
}

export function finalizeGenerationHappyPath(
  libraryRoot: string,
  transactionId: string,
  request: FinalizeGenerationRequest,
  options: TransactionOptions = {},
): {
  committed: true;
  commitMarkerPath: string;
  generation: GenerationRecord;
  draftUpdated: boolean;
  captured: CaptureGenerationResult[];
} {
  const captured = (request.outputSources ?? []).map((source) =>
    captureGenerationOutput(libraryRoot, transactionId, source, options),
  );
  const outcome = request.outcome ?? (request.toolResult ? "succeeded" : "failed");
  if (outcome === "succeeded") {
    if (!request.toolResult) {
      throw new ArchiveError(
        "ARCHIVE_SCHEMA_INVALID",
        "Successful finalization requires toolResult.",
      );
    }
    completeGeneration(libraryRoot, transactionId, { toolResult: request.toolResult }, options);
  } else {
    if (!request.error) {
      throw new ArchiveError("ARCHIVE_SCHEMA_INVALID", "Failed finalization requires error.");
    }
    failGeneration(libraryRoot, transactionId, { error: request.error }, options);
  }
  return { ...commitGeneration(libraryRoot, transactionId, options), captured };
}

export function completeGeneration(
  libraryRoot: string,
  transactionId: string,
  request: CompleteGenerationRequest,
  options: TransactionOptions = {},
): GenerationRecord {
  const transaction = readTransaction(libraryRoot, transactionId);
  const outputs = readOutputs(transaction.request.outputs);
  if (request.toolResult.outputCount !== outputs.length) {
    throw new ArchiveError(
      "ARCHIVE_SCHEMA_INVALID",
      "Tool output count does not match captured Output count.",
      {
        declared: request.toolResult.outputCount,
        captured: outputs.length,
      },
    );
  }
  return finalizeGeneration(
    libraryRoot,
    transactionId,
    {
      status: "succeeded",
      outcomeKnown: true,
      outputs,
      toolResult: request.toolResult,
      error: null,
    },
    options,
  );
}

export function failGeneration(
  libraryRoot: string,
  transactionId: string,
  request: FailGenerationRequest,
  options: TransactionOptions = {},
): GenerationRecord {
  const transaction = readTransaction(libraryRoot, transactionId);
  const error: GenerationErrorRecord = {
    code: request.error.code,
    summary: request.error.message,
    retryable: request.error.retryable,
    ...(request.error.moderation ? { moderation: request.error.moderation } : {}),
  };
  assertGenerationError(error);
  return finalizeGeneration(
    libraryRoot,
    transactionId,
    {
      status: "failed",
      outcomeKnown: true,
      outputs: readOutputs(transaction.request.outputs),
      error,
    },
    options,
  );
}

export function finalizeGenerationInterrupted(
  libraryRoot: string,
  transactionId: string,
  options: TransactionOptions = {},
): GenerationRecord {
  const transaction = readTransaction(libraryRoot, transactionId);
  return finalizeGeneration(
    libraryRoot,
    transactionId,
    {
      status: "interrupted",
      outcomeKnown: false,
      outputs: readOutputs(transaction.request.outputs),
      error: {
        code: "GENERATION_OUTCOME_UNKNOWN",
        summary: "The image generation result could not be determined.",
        retryable: false,
      },
    },
    options,
  );
}

export function commitGeneration(
  libraryRoot: string,
  transactionId: string,
  options: TransactionOptions = {},
): {
  committed: true;
  commitMarkerPath: string;
  generation: GenerationRecord;
  draftUpdated: boolean;
} {
  const transaction = readTransaction(libraryRoot, transactionId);
  assertGenerationTransaction(transaction.operation, transactionId);
  if (!transaction.creationId || !transaction.generationId || !transaction.revisionId) {
    throw new ArchiveError(
      "ARCHIVE_SCHEMA_INVALID",
      "Generation transaction is missing identity fields.",
      { transactionId },
    );
  }
  const marker = commitTransaction(libraryRoot, transactionId, options);
  const generationPath = resolveManagedPath(
    libraryRoot,
    `creations/${transaction.creationId}/generations/${transaction.generationId}/generation.json`,
  );
  const generation = readJson(generationPath) as GenerationRecord;
  assertRecordSchema(
    "generation",
    generation,
    `creations/${transaction.creationId}/generations/${transaction.generationId}/generation.json`,
  );

  const currentDraft = readDraft(libraryRoot, transaction.creationId);
  let draftUpdated = false;
  if (currentDraft.contentSha256 === transaction.draftContentSha256) {
    // Keep the user's Draft verbatim. The effective Prompt belongs only to the
    // immutable Prompt Revision committed above.
    updateDraft(
      libraryRoot,
      transaction.creationId,
      currentDraft.content,
      currentDraft.contentSha256,
      transaction.revisionId,
      options.adapters ?? defaultRuntimeAdapters,
    );
    draftUpdated = true;
  }
  return {
    committed: true,
    commitMarkerPath: `archive/commits/${marker.id}.json`,
    generation,
    draftUpdated,
  };
}

function finalizeGeneration(
  libraryRoot: string,
  transactionId: string,
  result: {
    status: GenerationRecord["status"];
    outcomeKnown: boolean;
    outputs: GenerationOutput[];
    toolResult?: CompleteGenerationRequest["toolResult"];
    error: GenerationErrorRecord | null;
  },
  options: TransactionOptions,
): GenerationRecord {
  const transaction = readTransaction(libraryRoot, transactionId);
  assertGenerationTransaction(transaction.operation, transactionId);
  if (transaction.state !== "invocation_started" && transaction.state !== "outputs_captured") {
    throw new ArchiveError(
      "TRANSACTION_INVALID_STATE",
      "Generation can only be finalized after invocation starts.",
      { transactionId, state: transaction.state },
    );
  }
  if (!transaction.creationId || !transaction.revisionId || !transaction.generationId) {
    throw new ArchiveError(
      "ARCHIVE_SCHEMA_INVALID",
      "Generation transaction is missing identity fields.",
      { transactionId },
    );
  }
  const references = readReferences(transaction.request.references);
  const configuredTool = readTool(transaction.request.tool);
  const startedAt = transaction.request.startedAt;
  if (typeof startedAt !== "string") {
    throw new ArchiveError(
      "ARCHIVE_SCHEMA_INVALID",
      "Generation transaction has no invocation timestamp.",
      { transactionId },
    );
  }
  const generation: GenerationRecord = {
    schemaVersion: 1,
    id: transaction.generationId,
    creationId: transaction.creationId,
    promptRevisionId: transaction.revisionId,
    replayOfGenerationId:
      typeof transaction.request.replayOfGenerationId === "string"
        ? transaction.request.replayOfGenerationId
        : null,
    status: result.status,
    outcomeKnown: result.outcomeKnown,
    references,
    outputs: result.outputs,
    tool: {
      name: configuredTool.name,
      model: result.toolResult?.model ?? configuredTool.model,
      parameters: result.toolResult?.parameters ?? configuredTool.parameters,
    },
    startedAt,
    completedAt: (options.adapters ?? defaultRuntimeAdapters).now(),
    error: result.error,
  };
  const generationPath = `creations/${transaction.creationId}/generations/${transaction.generationId}/generation.json`;
  stageRecordJson(libraryRoot, transactionId, "generation", generationPath, generation, options);
  transitionTransaction(
    libraryRoot,
    transactionId,
    "ready_to_commit",
    { terminalStatus: result.status },
    options,
  );
  return generation;
}

function assertGenerationCommitted(
  libraryRoot: string,
  creationId: string,
  generationId: string,
): void {
  const relativePath = `creations/${creationId}/generations/${generationId}/generation.json`;
  if (!readCommittedPathIndex(libraryRoot).has(relativePath)) {
    throw new ArchiveError(
      "ARCHIVE_CORRUPTION",
      "Replay source Generation is not committed for this Creation.",
      { creationId, generationId },
    );
  }
}

function assertGenerationTransaction(operation: string, transactionId: string): void {
  if (operation !== "generation") {
    throw new ArchiveError(
      "TRANSACTION_INVALID_STATE",
      "Transaction is not a Generation transaction.",
      { transactionId, operation },
    );
  }
}

function readOutputs(value: unknown): GenerationOutput[] {
  if (!Array.isArray(value)) {
    throw new ArchiveError(
      "ARCHIVE_SCHEMA_INVALID",
      "Generation transaction outputs are malformed.",
    );
  }
  return value as GenerationOutput[];
}

function readReferences(value: unknown): ReferenceImage[] {
  if (!Array.isArray(value)) {
    throw new ArchiveError(
      "ARCHIVE_SCHEMA_INVALID",
      "Generation transaction references are malformed.",
    );
  }
  const references = value as ReferenceImage[];
  assertReferenceImages(references);
  return references;
}

function readTool(value: unknown): PrepareGenerationRequest["tool"] {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as Record<string, unknown>).name !== "string" ||
    !Object.prototype.hasOwnProperty.call(value, "model") ||
    !(value as Record<string, unknown>).parameters ||
    typeof (value as Record<string, unknown>).parameters !== "object"
  ) {
    throw new ArchiveError(
      "ARCHIVE_SCHEMA_INVALID",
      "Generation transaction tool metadata is malformed.",
    );
  }
  return value as PrepareGenerationRequest["tool"];
}

function stagedRecordPathForPrompt(
  libraryRoot: string,
  transactionId: string,
  relativePath: string,
): string {
  return resolveManagedPath(libraryRoot, `.staging/${transactionId}/objects/${relativePath}`);
}
