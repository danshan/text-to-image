import { lstatSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { ArchiveError, type TransactionState } from "@text-to-image/domain";
import { pathExists, readJson, resolveManagedPath, syncDirectory } from "./internal.js";
import { commitGeneration, finalizeGenerationInterrupted } from "./generation.js";
import {
  commitTransaction,
  readTransaction,
  transactionPath,
  type TransactionOptions,
} from "./transaction.js";
import { readCommitMarkers } from "./validator.js";

export interface RecoverySummary {
  transactionId: string;
  state: TransactionState | "malformed";
  operation: string | null;
  committed: boolean;
  updatedAt: string | null;
}

export interface RecoveryInspection {
  summary: RecoverySummary;
  transaction: unknown;
  stagedRelativePaths: string[];
  archiveLock: unknown;
}

export interface RecoveryActionResult {
  action: "cancel" | "quarantine" | "finalize_interrupted" | "commit";
  transactionId: string;
  target: string;
  performed: boolean;
  committed?: boolean;
  commitMarkerPath?: string;
}

export function listRecoveryTransactions(libraryRoot: string): RecoverySummary[] {
  const stagingRoot = resolveManagedPath(libraryRoot, ".staging");
  if (!pathExists(stagingRoot)) {
    return [];
  }
  const committedIds = new Set(readCommitMarkers(libraryRoot).map((marker) => marker.id));
  return readdirSync(stagingRoot)
    .filter((name) => /^[a-f0-9-]{36}$/.test(name))
    .sort()
    .map<RecoverySummary>((transactionId) => {
      try {
        const transaction = readTransaction(libraryRoot, transactionId);
        return {
          transactionId,
          state: transaction.state,
          operation: transaction.operation,
          committed: committedIds.has(transactionId),
          updatedAt: transaction.updatedAt,
        };
      } catch {
        return {
          transactionId,
          state: "malformed",
          operation: null,
          committed: committedIds.has(transactionId),
          updatedAt: null,
        };
      }
    })
    .filter((summary) => !summary.committed);
}

export function inspectRecoveryTransaction(
  libraryRoot: string,
  transactionId: string,
): RecoveryInspection {
  const summary = listRecoveryTransactions(libraryRoot).find(
    (candidate) => candidate.transactionId === transactionId,
  );
  if (!summary) {
    throw new ArchiveError("TRANSACTION_NOT_FOUND", "Staging transaction does not exist.", {
      transactionId,
    });
  }
  const transactionFile = resolveManagedPath(
    libraryRoot,
    `.staging/${transactionId}/transaction.json`,
  );
  const transaction = readJsonOrNull(transactionFile);
  const objectsDirectory = join(transactionPath(libraryRoot, transactionId), "objects");
  const archiveLockPath = resolveManagedPath(libraryRoot, ".locks/archive.lock");
  let archiveLock: unknown = null;
  if (pathExists(archiveLockPath)) {
    try {
      archiveLock = readJson(archiveLockPath);
    } catch {
      archiveLock = { malformed: true };
    }
  }
  return {
    summary,
    transaction,
    stagedRelativePaths: pathExists(objectsDirectory) ? listFiles(objectsDirectory, "") : [],
    archiveLock,
  };
}

function readJsonOrNull(path: string): unknown {
  try {
    return readJson(path);
  } catch {
    return null;
  }
}

export function cancelPreparedTransaction(
  libraryRoot: string,
  transactionId: string,
  confirm = false,
): RecoveryActionResult {
  const transaction = readTransaction(libraryRoot, transactionId);
  if (transaction.state !== "prepared") {
    throw new ArchiveError(
      "RECOVERY_NOT_ALLOWED",
      "Only prepared transactions without invocation evidence can be cancelled.",
      { transactionId, state: transaction.state },
    );
  }
  return moveToQuarantine(libraryRoot, transactionId, "cancel", confirm);
}

export function quarantineTransaction(
  libraryRoot: string,
  transactionId: string,
  confirm = false,
): RecoveryActionResult {
  return moveToQuarantine(libraryRoot, transactionId, "quarantine", confirm);
}

export function recoverFinalizeInterrupted(
  libraryRoot: string,
  transactionId: string,
  confirm = false,
  options: TransactionOptions = {},
): RecoveryActionResult {
  const transaction = readTransaction(libraryRoot, transactionId);
  if (
    transaction.operation !== "generation" ||
    (transaction.state !== "invocation_started" && transaction.state !== "outputs_captured")
  ) {
    throw new ArchiveError(
      "RECOVERY_NOT_ALLOWED",
      "Only an invoked non-terminal Generation can be finalized as interrupted.",
      { transactionId, state: transaction.state },
    );
  }
  if (confirm) {
    finalizeGenerationInterrupted(libraryRoot, transactionId, options);
  }
  return {
    action: "finalize_interrupted",
    transactionId,
    target: `.staging/${transactionId}/transaction.json`,
    performed: confirm,
  };
}

export function recoverCommit(
  libraryRoot: string,
  transactionId: string,
  confirm = false,
  options: TransactionOptions = {},
): RecoveryActionResult {
  const transaction = readTransaction(libraryRoot, transactionId);
  if (transaction.state !== "ready_to_commit") {
    throw new ArchiveError(
      "RECOVERY_NOT_ALLOWED",
      "Only a ready_to_commit transaction can resume commit.",
      { transactionId, state: transaction.state },
    );
  }
  let commitMarkerPath = `archive/commits/${transactionId}.json`;
  if (confirm) {
    if (transaction.operation === "generation") {
      commitMarkerPath = commitGeneration(libraryRoot, transactionId, options).commitMarkerPath;
    } else {
      const marker = commitTransaction(libraryRoot, transactionId, options);
      commitMarkerPath = `archive/commits/${marker.id}.json`;
    }
  }
  return {
    action: "commit",
    transactionId,
    target: commitMarkerPath,
    performed: confirm,
    committed: confirm,
    commitMarkerPath,
  };
}

function moveToQuarantine(
  libraryRoot: string,
  transactionId: string,
  action: "cancel" | "quarantine",
  confirm: boolean,
): RecoveryActionResult {
  const source = transactionPath(libraryRoot, transactionId);
  if (!pathExists(source)) {
    throw new ArchiveError("TRANSACTION_NOT_FOUND", "Staging transaction does not exist.", {
      transactionId,
    });
  }
  const suffix = action === "cancel" ? "cancelled" : "quarantined";
  const targetName = `${transactionId}-${suffix}`;
  const target = resolveManagedPath(libraryRoot, `.quarantine/${targetName}`);
  if (pathExists(target)) {
    throw new ArchiveError("ARCHIVE_CONFLICT", "Quarantine target already exists.", {
      transactionId,
      target: `.quarantine/${targetName}`,
    });
  }
  if (confirm) {
    renameSync(source, target);
    syncDirectory(resolveManagedPath(libraryRoot, ".staging"));
    syncDirectory(resolveManagedPath(libraryRoot, ".quarantine"));
  }
  return {
    action,
    transactionId,
    target: `.quarantine/${targetName}`,
    performed: confirm,
  };
}

function listFiles(directory: string, prefix: string): string[] {
  const result: string[] = [];
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const relativePath = prefix ? `${prefix}/${name}` : name;
    const status = lstatSync(path);
    if (status.isDirectory() && !status.isSymbolicLink()) {
      result.push(...listFiles(path, relativePath));
    } else {
      result.push(relativePath);
    }
  }
  return result;
}
