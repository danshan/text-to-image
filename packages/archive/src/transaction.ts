import {
  constants,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  ArchiveError,
  assertTransactionTransition,
  type CommitMarker,
  type CommitOperation,
  type CommitRecordKind,
  type TransactionRecord,
  type TransactionState,
} from "@text-to-image/domain";
import {
  defaultRuntimeAdapters,
  jsonBytes,
  pathExists,
  readJson,
  resolveManagedPath,
  sha256Bytes,
  syncDirectory,
  type RuntimeAdapters,
  writeBytesAtomic,
  writeBytesExclusive,
  writeJsonAtomic,
} from "./internal.js";
import {
  assertLibraryValid,
  assertRecordSchema,
  readCommitMarkers,
  readCommittedPathIndex,
  readLibraryManifest,
} from "./validator.js";

export interface FailpointAdapter {
  hit(name: string): void;
}

export interface TransactionOptions {
  adapters?: RuntimeAdapters;
  failpoints?: FailpointAdapter;
}

export interface CreateTransactionInput {
  id?: string;
  operation: CommitOperation;
  creationId?: string | null;
  revisionId?: string | null;
  generationId?: string | null;
  draftContentSha256?: string | null;
  request?: Record<string, unknown>;
  state?: TransactionState;
}

export function createTransaction(
  libraryRoot: string,
  input: CreateTransactionInput,
  options: TransactionOptions = {},
): TransactionRecord {
  readLibraryManifest(libraryRoot);
  const adapters = options.adapters ?? defaultRuntimeAdapters;
  const id = input.id ?? adapters.uuid();
  const transactionDirectory = transactionPath(libraryRoot, id);
  if (existsSync(transactionDirectory)) {
    throw new ArchiveError("ARCHIVE_CONFLICT", "Transaction ID already exists.", {
      transactionId: id,
    });
  }
  mkdirSync(join(transactionDirectory, "objects"), { recursive: true });
  const timestamp = adapters.now();
  const transaction: TransactionRecord = {
    schemaVersion: 1,
    id,
    operation: input.operation,
    state: input.state ?? "prepared",
    creationId: input.creationId ?? null,
    revisionId: input.revisionId ?? null,
    generationId: input.generationId ?? null,
    draftContentSha256: input.draftContentSha256 ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    stagedRecords: [],
    request: input.request ?? {},
  };
  writeTransaction(libraryRoot, transaction);
  return transaction;
}

export function readTransaction(libraryRoot: string, transactionId: string): TransactionRecord {
  const path = resolveManagedPath(libraryRoot, `.staging/${transactionId}/transaction.json`);
  if (!pathExists(path)) {
    throw new ArchiveError("TRANSACTION_NOT_FOUND", "Staging transaction does not exist.", {
      transactionId,
    });
  }
  const value = readJson(path);
  try {
    assertRecordSchema("transaction", value, `.staging/${transactionId}/transaction.json`);
  } catch (error) {
    throw new ArchiveError(
      "ARCHIVE_SCHEMA_INVALID",
      "Staging transaction metadata is malformed.",
      {
        transactionId,
        cause: error instanceof Error ? error.message : String(error),
      },
      "Quarantine the malformed transaction after inspection.",
    );
  }
  const transaction = value as TransactionRecord;
  if (transaction.id !== transactionId) {
    throw new ArchiveError(
      "ARCHIVE_SCHEMA_INVALID",
      "Transaction directory and record ID do not match.",
      { transactionId, recordId: transaction.id },
    );
  }
  return transaction;
}

export function stageRecordBytes(
  libraryRoot: string,
  transactionId: string,
  kind: CommitRecordKind,
  relativePath: string,
  bytes: Uint8Array,
  options: TransactionOptions = {},
): TransactionRecord {
  const transaction = readTransaction(libraryRoot, transactionId);
  if (transaction.state === "ready_to_commit") {
    throw new ArchiveError(
      "TRANSACTION_INVALID_STATE",
      "Ready transaction cannot accept more staged records.",
      { transactionId },
    );
  }
  resolveManagedPath(libraryRoot, relativePath);
  const digest = sha256Bytes(bytes);
  const stagedPath = stagedRecordPath(libraryRoot, transactionId, relativePath);
  if (pathExists(stagedPath)) {
    const existingDigest = sha256Bytes(readFileSync(stagedPath));
    if (existingDigest !== digest) {
      throw new ArchiveError(
        "ARCHIVE_CONFLICT",
        "Staged record already exists with different bytes.",
        { transactionId, relativePath },
      );
    }
  } else {
    writeBytesAtomic(stagedPath, bytes);
  }
  const existingRecord = transaction.stagedRecords.find((record) => record.path === relativePath);
  if (existingRecord && (existingRecord.sha256 !== digest || existingRecord.kind !== kind)) {
    throw new ArchiveError(
      "ARCHIVE_CONFLICT",
      "Transaction contains conflicting metadata for a staged path.",
      { transactionId, relativePath },
    );
  }
  if (!existingRecord) {
    transaction.stagedRecords.push({ kind, path: relativePath, sha256: digest });
    transaction.stagedRecords.sort((left, right) => left.path.localeCompare(right.path));
  }
  transaction.updatedAt = (options.adapters ?? defaultRuntimeAdapters).now();
  writeTransaction(libraryRoot, transaction);
  options.failpoints?.hit("after_staging_record");
  return transaction;
}

export function stageRecordJson(
  libraryRoot: string,
  transactionId: string,
  kind: CommitRecordKind,
  relativePath: string,
  value: unknown,
  options: TransactionOptions = {},
): TransactionRecord {
  return stageRecordBytes(
    libraryRoot,
    transactionId,
    kind,
    relativePath,
    jsonBytes(value),
    options,
  );
}

export function transitionTransaction(
  libraryRoot: string,
  transactionId: string,
  nextState: TransactionState,
  requestPatch: Record<string, unknown> = {},
  options: TransactionOptions = {},
): TransactionRecord {
  const transaction = readTransaction(libraryRoot, transactionId);
  if (!(
    transaction.operation !== "generation" &&
    transaction.state === "prepared" &&
    nextState === "ready_to_commit"
  )) {
    assertTransactionTransition(transaction.state, nextState);
  }
  transaction.state = nextState;
  transaction.request = { ...transaction.request, ...requestPatch };
  transaction.updatedAt = (options.adapters ?? defaultRuntimeAdapters).now();
  writeTransaction(libraryRoot, transaction);
  return transaction;
}

export function patchTransaction(
  libraryRoot: string,
  transactionId: string,
  patch: {
    request?: Record<string, unknown>;
    updatedAt?: string;
  },
  options: TransactionOptions = {},
): TransactionRecord {
  const transaction = readTransaction(libraryRoot, transactionId);
  if (patch.request) {
    transaction.request = { ...transaction.request, ...patch.request };
  }
  transaction.updatedAt = patch.updatedAt ?? (options.adapters ?? defaultRuntimeAdapters).now();
  writeTransaction(libraryRoot, transaction);
  return transaction;
}

export function commitTransaction(
  libraryRoot: string,
  transactionId: string,
  options: TransactionOptions = {},
): CommitMarker {
  const adapters = options.adapters ?? defaultRuntimeAdapters;
  const transaction = readTransaction(libraryRoot, transactionId);
  if (transaction.state !== "ready_to_commit") {
    throw new ArchiveError(
      "TRANSACTION_INVALID_STATE",
      "Only ready_to_commit transactions can be committed.",
      { transactionId, state: transaction.state },
    );
  }
  if (transaction.stagedRecords.length === 0) {
    throw new ArchiveError("ARCHIVE_SCHEMA_INVALID", "Transaction has no records to commit.", {
      transactionId,
    });
  }
  validateStagedRecords(libraryRoot, transaction);
  assertLibraryValid(libraryRoot, "quick");

  const existingMarker = readCommitMarkers(libraryRoot).find(
    (marker) => marker.id === transactionId,
  );
  if (existingMarker) {
    return existingMarker;
  }

  const lock = acquireArchiveLock(libraryRoot, transactionId, adapters);
  options.failpoints?.hit("after_lock_acquired");
  try {
    readLibraryManifest(libraryRoot);
    const committedPaths = readCommittedPathIndex(libraryRoot);
    const markerRecords: CommitMarker["records"] = [];

    for (const [index, record] of transaction.stagedRecords.entries()) {
      const owner = committedPaths.get(record.path);
      if (owner) {
        if (record.kind !== "image_asset" || owner.sha256 !== record.sha256) {
          throw new ArchiveError(
            "ARCHIVE_CONFLICT",
            "Archive path is already owned by another Commit Marker.",
            { transactionId, relativePath: record.path, owner: owner.markerId },
          );
        }
        continue;
      }

      const source = stagedRecordPath(libraryRoot, transactionId, record.path);
      const destination = resolveManagedPath(libraryRoot, record.path);
      mkdirSync(dirname(destination), { recursive: true });
      if (pathExists(destination)) {
        const status = lstatSync(destination);
        if (!status.isFile() || status.isSymbolicLink()) {
          throw new ArchiveError(
            "ARCHIVE_CONFLICT",
            "Final Archive path exists and is not a regular file.",
            { relativePath: record.path },
          );
        }
        const existingDigest = sha256Bytes(readFileSync(destination));
        if (existingDigest !== record.sha256) {
          throw new ArchiveError(
            "ARCHIVE_CONFLICT",
            "Uncommitted final object conflicts with staged bytes.",
            { relativePath: record.path },
          );
        }
      } else {
        copyFileSync(source, destination, constants.COPYFILE_EXCL);
        const descriptor = openSync(destination, "r");
        try {
          fsyncSync(descriptor);
        } finally {
          closeSync(descriptor);
        }
        syncDirectory(dirname(destination));
      }
      markerRecords.push(record);
      options.failpoints?.hit(`after_object_install:${index}`);
    }

    if (markerRecords.length === 0) {
      const ownerMarkerIds = new Set(
        transaction.stagedRecords.map((record) => committedPaths.get(record.path)?.markerId),
      );
      const ownerMarkerId = [...ownerMarkerIds].find(
        (value): value is string => typeof value === "string",
      );
      const ownerMarker = readCommitMarkers(libraryRoot).find(
        (marker) => marker.id === ownerMarkerId,
      );
      if (
        ownerMarker &&
        ownerMarkerIds.size === 1 &&
        transaction.stagedRecords.every((record) => record.kind === "image_asset")
      ) {
        const stagedDirectory = transactionPath(libraryRoot, transaction.id);
        rmSync(stagedDirectory, { recursive: true });
        syncDirectory(join(libraryRoot, ".staging"));
        return ownerMarker;
      }
      throw new ArchiveError(
        "ARCHIVE_CONFLICT",
        "Transaction contains only objects committed by earlier transactions.",
        { transactionId },
      );
    }
    const marker: CommitMarker = {
      schemaVersion: 1,
      id: transaction.id,
      operation: transaction.operation,
      createdAt: adapters.now(),
      records: markerRecords,
    };
    assertRecordSchema("commit", marker, `archive/commits/${transaction.id}.json`);
    const markerDirectory = resolveManagedPath(libraryRoot, "archive/commits");
    mkdirSync(markerDirectory, { recursive: true });
    const temporaryMarker = join(markerDirectory, `.${transaction.id}.${lock.token}.tmp`);
    const finalMarker = join(markerDirectory, `${transaction.id}.json`);
    options.failpoints?.hit("before_marker_flush");
    writeBytesExclusive(temporaryMarker, jsonBytes(marker));
    options.failpoints?.hit("before_marker_rename");
    renameSync(temporaryMarker, finalMarker);
    syncDirectory(markerDirectory);
    options.failpoints?.hit("after_marker_rename");
    return marker;
  } finally {
    options.failpoints?.hit("before_lock_release");
    releaseArchiveLock(libraryRoot, lock.token);
  }
}

export function transactionPath(libraryRoot: string, transactionId: string): string {
  if (!/^[a-f0-9-]{36}$/.test(transactionId)) {
    throw new ArchiveError("ARCHIVE_PATH_ESCAPE", "Transaction ID is not a lowercase UUID.", {
      transactionId,
    });
  }
  return resolveManagedPath(libraryRoot, `.staging/${transactionId}`);
}

export function stagedRecordPath(
  libraryRoot: string,
  transactionId: string,
  relativePath: string,
): string {
  resolveManagedPath(libraryRoot, relativePath);
  return resolveManagedPath(libraryRoot, `.staging/${transactionId}/objects/${relativePath}`);
}

function writeTransaction(libraryRoot: string, transaction: TransactionRecord): void {
  assertRecordSchema("transaction", transaction, `.staging/${transaction.id}/transaction.json`);
  writeJsonAtomic(
    join(transactionPath(libraryRoot, transaction.id), "transaction.json"),
    transaction,
  );
}

function validateStagedRecords(libraryRoot: string, transaction: TransactionRecord): void {
  for (const record of transaction.stagedRecords) {
    const stagedPath = stagedRecordPath(libraryRoot, transaction.id, record.path);
    if (!pathExists(stagedPath)) {
      throw new ArchiveError("ARCHIVE_CORRUPTION", "Staged record is missing.", {
        transactionId: transaction.id,
        relativePath: record.path,
      });
    }
    const bytes = readFileSync(stagedPath);
    if (sha256Bytes(bytes) !== record.sha256) {
      throw new ArchiveError(
        "ARCHIVE_HASH_MISMATCH",
        "Staged record digest does not match transaction metadata.",
        { transactionId: transaction.id, relativePath: record.path },
      );
    }
    if (record.kind === "creation") {
      assertRecordSchema("creation", JSON.parse(bytes.toString("utf8")), record.path);
    } else if (record.kind === "revision") {
      assertRecordSchema("revision", JSON.parse(bytes.toString("utf8")), record.path);
    } else if (record.kind === "generation") {
      assertRecordSchema("generation", JSON.parse(bytes.toString("utf8")), record.path);
    }
  }
}

function acquireArchiveLock(
  libraryRoot: string,
  transactionId: string,
  adapters: RuntimeAdapters,
): { token: string } {
  const token = adapters.uuid();
  const lockPath = resolveManagedPath(libraryRoot, ".locks/archive.lock");
  const deadline = Date.now() + 2_000;
  while (true) {
    try {
      writeBytesExclusive(
        lockPath,
        jsonBytes({
          token,
          transactionId,
          pid: adapters.pid,
          hostname: adapters.hostname(),
          createdAt: adapters.now(),
        }),
      );
      return { token };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      if (Date.now() >= deadline) {
        throw new ArchiveError(
          "ARCHIVE_LOCKED",
          "Archive commit lock is already held.",
          { lockPath: ".locks/archive.lock" },
          "Inspect lock ownership and the associated transaction before recovery.",
        );
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
}

function releaseArchiveLock(libraryRoot: string, token: string): void {
  const lockPath = resolveManagedPath(libraryRoot, ".locks/archive.lock");
  if (!pathExists(lockPath)) {
    return;
  }
  let lock: unknown;
  try {
    lock = readJson(lockPath);
  } catch {
    return;
  }
  if (lock && typeof lock === "object" && (lock as Record<string, unknown>).token === token) {
    unlinkSync(lockPath);
    syncDirectory(dirname(lockPath));
  }
}
