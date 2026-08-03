import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ArchiveError,
  cancelPreparedTransaction,
  createCreation,
  importImageAsset,
  inspectRecoveryTransaction,
  listRecoveryTransactions,
  quarantineTransaction,
  readLibraryManifest,
  recoverCommit,
  recoverFinalizeInterrupted,
  resolveLibrary,
  updateCreationCuration,
  updateDraft,
  updateImageCuration,
  validateLibrary,
} from "@text-to-image/archive";
import type { CurationPatchRequest, RecoveryItem } from "@text-to-image/api-contract";
import type { ArchivePort } from "./archive-port.js";

interface JsonRecord {
  [key: string]: unknown;
}

async function countDirectories(path: string): Promise<number> {
  try {
    return (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isDirectory())
      .length;
  } catch {
    return 0;
  }
}

async function readLock(path: string): Promise<{ present: boolean; owner: string | null }> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    const record = typeof value === "object" && value !== null ? (value as JsonRecord) : {};
    const owner = typeof record.ownerToken === "string" ? record.ownerToken : null;
    return { present: true, owner };
  } catch {
    return { present: false, owner: null };
  }
}

function recoveryAction(state: RecoveryItem["state"]): RecoveryItem["recommendedAction"] {
  if (state === "prepared") return "cancel";
  if (state === "invocation_started") return "finalize_interrupted";
  if (state === "outputs_captured") return "continue";
  if (state === "ready_to_commit") return "commit";
  return "quarantine";
}

function availableActions(state: RecoveryItem["state"]): string[] {
  if (state === "prepared") return ["cancel", "quarantine"];
  if (state === "invocation_started") return ["finalize_interrupted", "quarantine"];
  if (state === "outputs_captured") return ["continue", "finalize_interrupted", "quarantine"];
  if (state === "ready_to_commit") return ["commit", "quarantine"];
  return ["quarantine"];
}

export class LocalArchiveAdapter implements ArchivePort {
  readonly libraryRoot: string;
  readonly formatVersion: number | null;
  readonly readOnly: boolean;

  constructor(libraryRoot: string) {
    this.libraryRoot = libraryRoot;
    let version: number | null = null;
    let readOnly: boolean;
    try {
      version = readLibraryManifest(libraryRoot).formatVersion;
      readOnly = !validateLibrary(libraryRoot, "quick").valid;
    } catch {
      readOnly = true;
    }
    this.formatVersion = version;
    this.readOnly = readOnly;
  }

  diagnostics(): Promise<string[]> {
    return Promise.resolve(
      validateLibrary(this.libraryRoot, "quick").diagnostics.map(
        (diagnostic) => `${diagnostic.code}: ${diagnostic.message}`,
      ),
    );
  }

  createCreation(input: { title: string; prompt: string }): Promise<{ id: string }> {
    const result = createCreation(this.libraryRoot, input);
    return Promise.resolve({ id: result.creation.id });
  }

  updateCreationCuration(
    id: string,
    request: CurationPatchRequest,
  ): Promise<Record<string, unknown>> {
    return Promise.resolve(
      updateCreationCuration(
        this.libraryRoot,
        id,
        request.expectedRevision,
        request.patch,
      ) as unknown as Record<string, unknown>,
    );
  }

  updateImageCuration(
    sha256: string,
    request: CurationPatchRequest,
  ): Promise<Record<string, unknown>> {
    return Promise.resolve(
      updateImageCuration(
        this.libraryRoot,
        sha256,
        request.expectedRevision,
        request.patch,
      ) as unknown as Record<string, unknown>,
    );
  }

  updateDraft(
    creationId: string,
    input: { expectedContentSha256: string; content: string; basedOnRevisionId: string | null },
  ): Promise<Record<string, unknown>> {
    return Promise.resolve(
      updateDraft(
        this.libraryRoot,
        creationId,
        input.content,
        input.expectedContentSha256,
        input.basedOnRevisionId,
      ) as unknown as Record<string, unknown>,
    );
  }

  importImage(sourcePath: string): Promise<{ sha256: string }> {
    const result = importImageAsset(this.libraryRoot, sourcePath);
    return Promise.resolve({ sha256: result.assetSha256 });
  }

  async listRecovery(): Promise<{
    items: RecoveryItem[];
    quarantineCount: number;
    lock: { present: boolean; owner: string | null };
  }> {
    const summaries = listRecoveryTransactions(this.libraryRoot);
    const items = summaries.map((summary): RecoveryItem => {
      const inspection = inspectRecoveryTransaction(this.libraryRoot, summary.transactionId);
      const transaction =
        typeof inspection.transaction === "object" && inspection.transaction !== null
          ? (inspection.transaction as JsonRecord)
          : {};
      const state = summary.state;
      const updatedAt = summary.updatedAt ? Date.parse(summary.updatedAt) : Date.now();
      return {
        transactionId: summary.transactionId,
        state,
        creationId: typeof transaction.creationId === "string" ? transaction.creationId : null,
        generationId:
          typeof transaction.generationId === "string" ? transaction.generationId : null,
        ageSeconds: Math.max(0, Math.round((Date.now() - updatedAt) / 1000)),
        validation: [`${inspection.stagedRelativePaths.length} staged records found.`],
        recommendedAction: recoveryAction(state),
        availableActions: availableActions(state),
      };
    });
    return {
      items,
      quarantineCount: await countDirectories(join(this.libraryRoot, ".quarantine")),
      lock: await readLock(join(this.libraryRoot, ".locks", "archive.lock")),
    };
  }

  recover(
    transactionId: string,
    action: string,
    dryRun: boolean,
  ): Promise<Record<string, unknown>> {
    const confirm = !dryRun;
    if (action === "cancel") {
      return Promise.resolve(
        cancelPreparedTransaction(this.libraryRoot, transactionId, confirm) as unknown as Record<
          string,
          unknown
        >,
      );
    }
    if (action === "quarantine") {
      return Promise.resolve(
        quarantineTransaction(this.libraryRoot, transactionId, confirm) as unknown as Record<
          string,
          unknown
        >,
      );
    }
    if (action === "finalize_interrupted") {
      return Promise.resolve(
        recoverFinalizeInterrupted(this.libraryRoot, transactionId, confirm) as unknown as Record<
          string,
          unknown
        >,
      );
    }
    if (action === "commit") {
      return Promise.resolve(
        recoverCommit(this.libraryRoot, transactionId, confirm) as unknown as Record<
          string,
          unknown
        >,
      );
    }
    if (action === "continue") {
      const inspection = inspectRecoveryTransaction(this.libraryRoot, transactionId);
      return Promise.resolve({
        action,
        transactionId,
        performed: false,
        consequence: "Resume the repository Generation Skill with this transaction ID.",
        stagedRelativePaths: inspection.stagedRelativePaths,
      });
    }
    return Promise.reject(
      new ArchiveError("RECOVERY_NOT_ALLOWED", "Recovery action is not supported.", {
        transactionId,
        action,
      }),
    );
  }
}

export function createArchiveAdapter(options: {
  gitRoot: string;
  libraryArgument?: string;
}): LocalArchiveAdapter {
  const resolved = resolveLibrary({
    gitRoot: options.gitRoot,
    ...(options.libraryArgument ? { cliPath: options.libraryArgument } : {}),
  });
  return new LocalArchiveAdapter(resolved.libraryRoot);
}
