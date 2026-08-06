#!/usr/bin/env node
import { createReadStream, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
  ArchiveError,
  LIBRARY_FORMAT_VERSION,
  beginGeneration,
  cancelPreparedTransaction,
  captureGenerationOutput,
  canonicalizePossiblyMissing,
  checkpointRevision,
  commitGeneration,
  completeGeneration,
  createCreation,
  creationPurgeTarget,
  executePurge,
  failGeneration,
  finalizeGenerationHappyPath,
  findGitRoot,
  importImageAsset,
  imagePurgeTarget,
  inspectImageSource,
  initLibrary,
  inspectRecoveryTransaction,
  listRecoveryTransactions,
  markInvocationStarted,
  preflightGeneration,
  assertPreparedPromptHash,
  mergeLibrary,
  persistLibrarySelection,
  preparePurge,
  prepareGeneration,
  quarantineTransaction,
  readDraft,
  readPurgeStatus,
  recoverCommit,
  recoverFinalizeInterrupted,
  resolveLibrary,
  updateCreationCuration,
  updateDraft,
  updateImageCuration,
  validateLibrary,
  WorkflowProgress,
  type CreateCreationInput,
  type BeginGenerationRequest,
  type FailGenerationRequest,
  type FinalizeGenerationRequest,
  type GenerationPreflightRequest,
  type PrepareGenerationRequest,
} from "@text-to-image/archive";
import {
  IndexCoordinationError,
  ReadModel,
  type IndexCatchUpResult,
} from "@text-to-image/read-model";

interface ParsedArguments {
  positionals: string[];
  options: Map<string, string | string[] | true>;
}

interface CliResult {
  exitCode: number;
  value?: unknown;
}

export const MAX_STDIN_BYTES = 1024 * 1024;

export async function run(argv: string[]): Promise<CliResult> {
  const parsed = parseArguments(argv);
  const [command, subcommand, action] = parsed.positionals;

  if (command === "capabilities") {
    return success({
      cliVersion: "0.1.0",
      supportedLibraryFormats: [LIBRARY_FORMAT_VERSION],
      generationWorkflowVersion: 1,
      commands: [
        "library.resolve",
        "library.select",
        "library.merge",
        "init",
        "validate",
        "index.rebuild",
        "index.catch-up",
        "creation.create",
        "draft.show",
        "draft.update",
        "asset.import",
        "asset.inspect",
        "revision.checkpoint",
        "generation.prepare",
        "generation.preflight",
        "generation.begin",
        "generation.verify-prompt",
        "generation.mark-invocation-started",
        "generation.capture",
        "generation.finalize",
        "generation.finalize-happy-path",
        "generation.complete",
        "generation.fail",
        "generation.commit",
        "recover.list",
        "recover.inspect",
        "recover.cancel",
        "recover.finalize-interrupted",
        "recover.commit",
        "recover.quarantine",
        "purge.creation.prepare",
        "purge.creation.execute",
        "purge.image.prepare",
        "purge.image.execute",
        "purge.status",
      ],
    });
  }

  if (command === "fixtures" && subcommand === "validate") {
    const fixturesRoot = join(findGitRoot(), "fixtures", "asset-libraries");
    const fixtures = readdirSync(fixturesRoot)
      .filter((name) => name.startsWith("v1-"))
      .sort()
      .map((name) => {
        const root = join(fixturesRoot, name);
        const expectation = JSON.parse(readFileSync(join(root, "fixture.json"), "utf8")) as {
          expectedValid: boolean;
          expectedCode?: string;
        };
        const report = validateLibrary(root, "full");
        const codeMatched = expectation.expectedCode
          ? report.diagnostics.some((diagnostic) => diagnostic.code === expectation.expectedCode)
          : true;
        return {
          name,
          expectedValid: expectation.expectedValid,
          actualValid: report.valid,
          matched: expectation.expectedValid === report.valid && codeMatched,
          diagnostics: report.diagnostics,
        };
      });
    return {
      exitCode: fixtures.every((fixture) => fixture.matched) ? 0 : 2,
      value: {
        valid: fixtures.every((fixture) => fixture.matched),
        fixtures,
      },
    };
  }

  const cliPath = stringOption(parsed, "library", false);
  const resolved = resolveLibrary(cliPath ? { cliPath } : {});
  if (command === "library" && subcommand === "resolve") {
    return success({ libraryRoot: resolved.libraryRoot });
  }
  if (command === "library" && subcommand === "select") {
    if (!cliPath) {
      throw new ArchiveError("LIBRARY_CONFIG_INVALID", "Missing required --library option.");
    }
    const report = validateLibrary(resolved.libraryRoot, "full");
    if (!report.valid) {
      throw new ArchiveError("ARCHIVE_CORRUPTION", "Cannot select an invalid Library.", {
        libraryRoot: resolved.libraryRoot,
        diagnostics: report.diagnostics,
      });
    }
    return success(persistLibrarySelection(resolved.gitRoot, resolved.libraryRoot));
  }
  if (command === "library" && subcommand === "merge") {
    const sourceArgument = stringOption(parsed, "source");
    const sourceRoot = canonicalizePossiblyMissing(
      isAbsolute(sourceArgument) ? sourceArgument : resolve(resolved.gitRoot, sourceArgument),
    );
    return success(
      mergeLibrary(resolved.libraryRoot, sourceRoot, {
        dryRun: parsed.options.has("dry-run"),
      }),
    );
  }
  if (command === "init") {
    const initialized = initLibrary(resolved.libraryRoot);
    if (!cliPath) return success(initialized);
    return success({
      ...initialized,
      selection: persistLibrarySelection(resolved.gitRoot, initialized.libraryRoot),
    });
  }
  if (command === "validate") {
    const report = validateLibrary(
      resolved.libraryRoot,
      parsed.options.has("full") ? "full" : "quick",
    );
    return { exitCode: report.valid ? 0 : 2, value: report };
  }
  if (command === "index" && subcommand === "rebuild") {
    const readModel = new ReadModel(resolved.libraryRoot);
    try {
      await readModel.rebuild();
      return success(await readModel.status());
    } finally {
      readModel.close();
    }
  }
  if (command === "index" && subcommand === "catch-up") {
    const readModel = new ReadModel(resolved.libraryRoot);
    try {
      await readModel.open({ rebuildIfMissing: false });
      return success(await readModel.catchUp());
    } finally {
      readModel.close();
    }
  }
  if (command === "creation" && subcommand === "create") {
    const request = await readStdinJson<CreateCreationInput>();
    return success(createCreation(resolved.libraryRoot, request));
  }
  if (command === "draft" && subcommand === "show") {
    return success(readDraft(resolved.libraryRoot, stringOption(parsed, "creation")));
  }
  if (command === "draft" && subcommand === "update") {
    const request = await readStdinJson<{
      content: string;
      expectedContentSha256: string;
      basedOnRevisionId?: string | null;
    }>();
    return success(
      updateDraft(
        resolved.libraryRoot,
        stringOption(parsed, "creation"),
        request.content,
        request.expectedContentSha256,
        request.basedOnRevisionId,
      ),
    );
  }
  if (command === "asset" && subcommand === "import") {
    return success(importImageAsset(resolved.libraryRoot, stringOption(parsed, "source")));
  }
  if (command === "asset" && subcommand === "inspect") {
    return success(inspectImageSource(stringOption(parsed, "source")));
  }
  if (command === "revision" && subcommand === "checkpoint") {
    const request = await readStdinJson<{
      prompt: string;
      changeInstruction?: string;
      parentRevisionId?: string | null;
      revisionId?: string;
    }>();
    return success(
      checkpointRevision(resolved.libraryRoot, stringOption(parsed, "creation"), request),
    );
  }
  if (command === "generation" && subcommand === "prepare") {
    return success(
      prepareGeneration(
        resolved.libraryRoot,
        stringOption(parsed, "creation"),
        await readStdinJson<PrepareGenerationRequest>(),
      ),
    );
  }
  if (command === "generation" && subcommand === "preflight") {
    const request = parsed.options.has("request-stdin")
      ? await readStdinJson<GenerationPreflightRequest>()
      : ({} satisfies GenerationPreflightRequest);
    const source = stringOption(parsed, "source", false);
    if (source) request.sessionImagePaths = [...(request.sessionImagePaths ?? []), source];
    return success(
      preflightGeneration(resolved.libraryRoot, stringOption(parsed, "creation"), request),
    );
  }
  if (command === "generation" && subcommand === "begin") {
    return success(
      beginGeneration(
        resolved.libraryRoot,
        stringOption(parsed, "creation"),
        await readStdinJson<BeginGenerationRequest>(),
      ),
    );
  }
  if (command === "generation" && subcommand === "verify-prompt") {
    assertPreparedPromptHash(
      resolved.libraryRoot,
      stringOption(parsed, "transaction"),
      stringOption(parsed, "prompt-sha256"),
    );
    return success({ verified: true });
  }
  if (command === "generation" && subcommand === "mark-invocation-started") {
    const expectedPromptSha256 = stringOption(parsed, "prompt-sha256", false);
    if (expectedPromptSha256) {
      markInvocationStarted(
        resolved.libraryRoot,
        stringOption(parsed, "transaction"),
        expectedPromptSha256,
      );
    } else {
      markInvocationStarted(resolved.libraryRoot, stringOption(parsed, "transaction"));
    }
    return success({ marked: true });
  }
  if (command === "generation" && subcommand === "capture") {
    return success(
      captureGenerationOutput(
        resolved.libraryRoot,
        stringOption(parsed, "transaction"),
        stringOption(parsed, "source"),
      ),
    );
  }
  if (command === "generation" && subcommand === "complete") {
    return success(
      completeGeneration(
        resolved.libraryRoot,
        stringOption(parsed, "transaction"),
        await readStdinJson(),
      ),
    );
  }
  if (command === "generation" && subcommand === "fail") {
    return success(
      failGeneration(
        resolved.libraryRoot,
        stringOption(parsed, "transaction"),
        await readStdinJson<FailGenerationRequest>(),
      ),
    );
  }
  if (command === "generation" && subcommand === "commit") {
    return success(commitGeneration(resolved.libraryRoot, stringOption(parsed, "transaction")));
  }
  if (
    command === "generation" &&
    (subcommand === "finalize" || subcommand === "finalize-happy-path")
  ) {
    const startedAt = Date.now();
    const payload = await readStdinJson<
      FinalizeGenerationRequest & {
        workflowRunId?: string;
        workflowElapsedMsBeforeFinalize?: number | null;
        preToolMs?: number | null;
        postToolMsBeforeFinalize?: number | null;
        nonModelOverheadMs?: number | null;
      }
    >();
    const finalized = finalizeGenerationHappyPath(
      resolved.libraryRoot,
      stringOption(parsed, "transaction"),
      payload,
    );
    const committedAt = Date.now();
    const readModel = new ReadModel(resolved.libraryRoot);
    try {
      let index: IndexCatchUpResult;
      try {
        await readModel.open();
        index = await readModel.catchUp();
      } catch (error) {
        const status = await readModel.status().catch(() => null);
        index = {
          status: "degraded",
          processed: 0,
          total: 0,
          lagCount: status?.lagCount ?? 0,
          lastIndexedMarker: status?.lastIndexedMarker ?? null,
          failedMarker: null,
          code:
            status?.code ??
            (error instanceof IndexCoordinationError ? error.code : "INDEX_REBUILD_FAILED"),
          error: error instanceof Error ? error.message : String(error),
        };
      }
      const completedAt = Date.now();
      const workflowRunId = payload.workflowRunId?.trim();
      const elapsedBeforeFinalize = boundedDuration(payload.workflowElapsedMsBeforeFinalize);
      const progress = workflowRunId
        ? new WorkflowProgress(workflowRunId, startedAt - (elapsedBeforeFinalize ?? 0))
        : null;
      const telemetry = progress
        ? (() => {
            progress.stage("Archive committed", committedAt);
            if (index.status === "ready") progress.stage("Index ready", completedAt);
            const postToolBeforeFinalize = boundedDuration(payload.postToolMsBeforeFinalize);
            return progress.telemetry({
              terminalStatus: finalized.generation.status,
              ...(finalized.generation.error?.code
                ? { errorCode: finalized.generation.error.code }
                : {}),
              ...(payload.preToolMs !== undefined ? { preToolMs: payload.preToolMs } : {}),
              postToolMs:
                postToolBeforeFinalize === null
                  ? null
                  : postToolBeforeFinalize + completedAt - startedAt,
              ...(payload.nonModelOverheadMs !== undefined
                ? { nonModelOverheadMs: payload.nonModelOverheadMs }
                : {}),
            });
          })()
        : null;
      return success({
        ...finalized,
        index,
        telemetry,
        repositoryTimings: { finalizeAndIndexMs: completedAt - startedAt },
      });
    } finally {
      readModel.close();
    }
  }
  if (command === "curation" && subcommand === "creation" && action === "update") {
    const request = await readStdinJson<{
      expectedEntityRevision: number;
      patch: Parameters<typeof updateCreationCuration>[3];
    }>();
    return success(
      updateCreationCuration(
        resolved.libraryRoot,
        stringOption(parsed, "creation"),
        request.expectedEntityRevision,
        request.patch,
      ),
    );
  }
  if (command === "curation" && subcommand === "image" && action === "update") {
    const request = await readStdinJson<{
      expectedEntityRevision: number;
      patch: Parameters<typeof updateImageCuration>[3];
    }>();
    return success(
      updateImageCuration(
        resolved.libraryRoot,
        stringOption(parsed, "asset"),
        request.expectedEntityRevision,
        request.patch,
      ),
    );
  }
  if (command === "recover" && subcommand === "list") {
    return success(listRecoveryTransactions(resolved.libraryRoot));
  }
  if (command === "recover" && subcommand === "inspect") {
    return success(
      inspectRecoveryTransaction(resolved.libraryRoot, stringOption(parsed, "transaction")),
    );
  }
  if (command === "recover" && subcommand === "cancel") {
    return success(
      cancelPreparedTransaction(
        resolved.libraryRoot,
        stringOption(parsed, "transaction"),
        parsed.options.has("confirm"),
      ),
    );
  }
  if (command === "recover" && subcommand === "finalize-interrupted") {
    return success(
      recoverFinalizeInterrupted(
        resolved.libraryRoot,
        stringOption(parsed, "transaction"),
        parsed.options.has("confirm"),
      ),
    );
  }
  if (command === "recover" && subcommand === "commit") {
    return success(
      recoverCommit(
        resolved.libraryRoot,
        stringOption(parsed, "transaction"),
        parsed.options.has("confirm"),
      ),
    );
  }
  if (command === "recover" && subcommand === "quarantine") {
    return success(
      quarantineTransaction(
        resolved.libraryRoot,
        stringOption(parsed, "transaction"),
        parsed.options.has("confirm"),
      ),
    );
  }
  if (command === "purge" && (subcommand === "creation" || subcommand === "image")) {
    const target =
      subcommand === "creation"
        ? creationPurgeTarget(stringOption(parsed, "creation"))
        : imagePurgeTarget(stringOption(parsed, "asset"));
    const abandonRecoveryTransactionIds = stringOptions(parsed, "abandon-recovery");
    if (action === "prepare") {
      return success(preparePurge(resolved.libraryRoot, target, { abandonRecoveryTransactionIds }));
    }
    if (action === "execute") {
      const result = executePurge(resolved.libraryRoot, target, {
        planDigest: stringOption(parsed, "plan-digest"),
        confirmed: parsed.options.has("confirm"),
        abandonRecoveryTransactionIds,
      });
      const readModel = new ReadModel(resolved.libraryRoot);
      try {
        await readModel.open();
        await readModel.rebuild();
      } finally {
        readModel.close();
      }
      return success(result);
    }
  }
  if (command === "purge" && subcommand === "status") {
    return success({
      operation: readPurgeStatus(resolved.libraryRoot, stringOption(parsed, "operation", false)),
    });
  }

  throw new ArchiveError("LIBRARY_CONFIG_INVALID", "Unknown assetctl command.", {
    positionals: parsed.positionals,
  });
}

function parseArguments(argv: string[]): ParsedArguments {
  const positionals: string[] = [];
  const options = new Map<string, string | string[] | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!;
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const name = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      const current = options.get(name);
      options.set(
        name,
        typeof current === "string"
          ? [current, next]
          : Array.isArray(current)
            ? [...current, next]
            : next,
      );
      index += 1;
    } else {
      options.set(name, true);
    }
  }
  return { positionals, options };
}

function stringOption(parsed: ParsedArguments, name: string): string;
function stringOption(parsed: ParsedArguments, name: string, required: false): string | undefined;
function stringOption(
  parsed: ParsedArguments,
  name: string,
  required: boolean = true,
): string | undefined {
  const value = parsed.options.get(name);
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) return value.at(-1);
  if (!required) {
    return undefined;
  }
  throw new ArchiveError("LIBRARY_CONFIG_INVALID", `Missing required --${name} option.`);
}

function stringOptions(parsed: ParsedArguments, name: string): string[] {
  const value = parsed.options.get(name);
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value : [];
}

export function readBoundedStdin(fd = 0, maxBytes = MAX_STDIN_BYTES): Promise<string> {
  const stream = fd === 0 ? process.stdin : createReadStream("/dev/null", { fd, autoClose: false });
  const restoreRawMode = fd === 0 ? enterRawStdinMode(process.stdin) : () => undefined;
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const cleanup = () => {
      restoreRawMode();
      stream.pause();
      stream.removeListener("data", onData);
      stream.removeListener("end", onEnd);
      stream.removeListener("error", onError);
      if (fd === 0) {
        process.stdin.unref?.();
      } else {
        stream.destroy();
      }
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const finish = (input: Uint8Array) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        resolve(parseBoundedStdin(input, maxBytes));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    const onData = (chunk: Buffer | string) => {
      const data = Buffer.from(chunk);
      const lineFeed = data.indexOf(0x0a);
      const payload = lineFeed === -1 ? data : data.subarray(0, lineFeed);
      size += payload.length;
      if (size > maxBytes) {
        fail(
          new ArchiveError("STDIN_TOO_LARGE", "stdin request exceeds the bounded payload limit.", {
            maxBytes,
          }),
        );
        return;
      }
      chunks.push(Buffer.from(payload));
      if (lineFeed !== -1) {
        const trailing = data.subarray(lineFeed + 1);
        if (trailing.some((value) => !/\s/u.test(String.fromCharCode(value)))) {
          fail(
            new ArchiveError(
              "STDIN_INVALID",
              "stdin request contains more than one JSON value or trailing content.",
            ),
          );
          return;
        }
        finish(Buffer.concat(chunks));
      }
    };
    const onEnd = () => finish(Buffer.concat(chunks));
    const onError = (error: Error) => fail(error);
    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("error", onError);
  });
}

export function enterRawStdinMode(stream: typeof process.stdin): () => void {
  if (!stream.isTTY || typeof stream.setRawMode !== "function") return () => undefined;
  const wasRaw = stream.isRaw ?? false;
  if (!wasRaw) stream.setRawMode(true);
  return () => {
    if ((stream.isRaw ?? false) !== wasRaw) stream.setRawMode(wasRaw);
  };
}

function boundedDuration(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function parseBoundedStdin(input: Uint8Array | string, maxBytes = MAX_STDIN_BYTES): string {
  const bytes = Buffer.from(input);
  const lineFeed = bytes.indexOf(0x0a);
  const payload = lineFeed === -1 ? bytes : bytes.subarray(0, lineFeed);
  if (payload.length > maxBytes) {
    throw new ArchiveError("STDIN_TOO_LARGE", "stdin request exceeds the bounded payload limit.", {
      maxBytes,
    });
  }
  if (lineFeed !== -1) {
    const trailing = bytes.subarray(lineFeed + 1);
    if (trailing.some((value) => !/\s/u.test(String.fromCharCode(value)))) {
      throw new ArchiveError(
        "STDIN_INVALID",
        "stdin request contains more than one JSON value or trailing content.",
      );
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(payload);
  } catch {
    throw new ArchiveError("STDIN_INVALID", "stdin request is not valid UTF-8.");
  }
}

async function readStdinJson<T = Parameters<typeof completeGeneration>[2]>(): Promise<T> {
  const input = await readBoundedStdin();
  if (!input.trim()) {
    throw new ArchiveError("STDIN_INVALID", "Expected one JSON request on stdin.");
  }
  try {
    return JSON.parse(input) as T;
  } catch {
    throw new ArchiveError("STDIN_INVALID", "stdin request is not valid JSON.");
  }
}

function success(value: unknown): CliResult {
  return { exitCode: 0, value };
}

function serializeError(error: unknown): unknown {
  if (error instanceof ArchiveError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      recoveryHint: error.recoveryHint ?? null,
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : String(error),
    details: {},
    recoveryHint: null,
  };
}

async function main(): Promise<void> {
  try {
    const result = await run(process.argv.slice(2));
    if (result.value !== undefined) {
      process.stdout.write(`${JSON.stringify(result.value)}\n`);
    }
    process.exitCode = result.exitCode;
  } catch (error) {
    const machineMode = process.argv.includes("--format") && process.argv.includes("json");
    const output = `${JSON.stringify(serializeError(error))}\n`;
    if (machineMode) {
      process.stdout.write(output);
    } else {
      process.stderr.write(output);
    }
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
