#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
  ArchiveError,
  LIBRARY_FORMAT_VERSION,
  cancelPreparedTransaction,
  captureGenerationOutput,
  canonicalizePossiblyMissing,
  checkpointRevision,
  commitGeneration,
  completeGeneration,
  createCreation,
  failGeneration,
  findGitRoot,
  importImageAsset,
  inspectImageSource,
  initLibrary,
  inspectRecoveryTransaction,
  listRecoveryTransactions,
  markInvocationStarted,
  mergeLibrary,
  persistLibrarySelection,
  prepareGeneration,
  quarantineTransaction,
  readDraft,
  recoverCommit,
  recoverFinalizeInterrupted,
  resolveLibrary,
  updateCreationCuration,
  updateDraft,
  updateImageCuration,
  validateLibrary,
  type CreateCreationInput,
  type FailGenerationRequest,
  type PrepareGenerationRequest,
} from "@text-to-image/archive";
import { ReadModel } from "@text-to-image/read-model";

interface ParsedArguments {
  positionals: string[];
  options: Map<string, string | true>;
}

interface CliResult {
  exitCode: number;
  value?: unknown;
}

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
        "creation.create",
        "draft.show",
        "draft.update",
        "asset.import",
        "asset.inspect",
        "revision.checkpoint",
        "generation.prepare",
        "generation.mark-invocation-started",
        "generation.capture",
        "generation.complete",
        "generation.fail",
        "generation.commit",
        "recover.list",
        "recover.inspect",
        "recover.cancel",
        "recover.finalize-interrupted",
        "recover.commit",
        "recover.quarantine",
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
  if (command === "creation" && subcommand === "create") {
    const request = readStdinJson<CreateCreationInput>();
    return success(createCreation(resolved.libraryRoot, request));
  }
  if (command === "draft" && subcommand === "show") {
    return success(readDraft(resolved.libraryRoot, stringOption(parsed, "creation")));
  }
  if (command === "draft" && subcommand === "update") {
    const request = readStdinJson<{
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
    const request = readStdinJson<{
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
        readStdinJson<PrepareGenerationRequest>(),
      ),
    );
  }
  if (command === "generation" && subcommand === "mark-invocation-started") {
    markInvocationStarted(resolved.libraryRoot, stringOption(parsed, "transaction"));
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
        readStdinJson(),
      ),
    );
  }
  if (command === "generation" && subcommand === "fail") {
    return success(
      failGeneration(
        resolved.libraryRoot,
        stringOption(parsed, "transaction"),
        readStdinJson<FailGenerationRequest>(),
      ),
    );
  }
  if (command === "generation" && subcommand === "commit") {
    return success(commitGeneration(resolved.libraryRoot, stringOption(parsed, "transaction")));
  }
  if (command === "curation" && subcommand === "creation" && action === "update") {
    const request = readStdinJson<{
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
    const request = readStdinJson<{
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

  throw new ArchiveError("LIBRARY_CONFIG_INVALID", "Unknown assetctl command.", {
    positionals: parsed.positionals,
  });
}

function parseArguments(argv: string[]): ParsedArguments {
  const positionals: string[] = [];
  const options = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!;
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const name = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options.set(name, next);
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
  if (!required) {
    return undefined;
  }
  throw new ArchiveError("LIBRARY_CONFIG_INVALID", `Missing required --${name} option.`);
}

function readStdinJson<T = Parameters<typeof completeGeneration>[2]>(): T {
  const input = readFileSync(0, "utf8");
  if (!input.trim()) {
    throw new ArchiveError("LIBRARY_CONFIG_INVALID", "Expected one JSON request on stdin.");
  }
  try {
    return JSON.parse(input) as T;
  } catch {
    throw new ArchiveError("LIBRARY_CONFIG_INVALID", "stdin request is not valid JSON.");
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
