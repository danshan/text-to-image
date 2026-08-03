import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { ArchiveError, type CommitMarker, type CommitRecordKind } from "@text-to-image/domain";
import { pathExists, resolveManagedPath, sha256Bytes } from "./internal.js";
import { listRecoveryTransactions } from "./recovery.js";
import {
  commitTransaction,
  createTransaction,
  stageMergeMutableFiles,
  stageRecordFiles,
  transitionTransaction,
  type TransactionOptions,
} from "./transaction.js";
import { readCommitMarkers, readCommittedPathIndex, validateLibrary } from "./validator.js";

type CountKey = "creations" | "revisions" | "generations" | "imageAssets";

export interface MergeCounts {
  creations: number;
  revisions: number;
  generations: number;
  imageAssets: number;
}

export interface MergeLibraryResult {
  dryRun: boolean;
  applied: boolean;
  sourceLibraryRoot: string;
  destinationLibraryRoot: string;
  imported: MergeCounts;
  reused: MergeCounts;
  preservedDestinationCuration: number;
  preservedDestinationDraft: number;
  ignoredInboxFileCount: number;
  transactionId: string | null;
}

export interface MergeLibraryOptions extends TransactionOptions {
  dryRun?: boolean;
}

interface PlannedRecord {
  kind: CommitRecordKind;
  path: string;
  sha256: string;
  sourcePath: string;
}

interface SnapshotEntry {
  path: string;
  sha256: string;
}

interface IdentityEntry {
  path: string;
  sha256: string;
}

const MUTABLE_PATHS = ["prompt-draft.md", "prompt-draft.json"] as const;

export function mergeLibrary(
  destinationInput: string,
  sourceInput: string,
  options: MergeLibraryOptions = {},
): MergeLibraryResult {
  const destinationRoot = existingLibraryRoot(destinationInput, "destination");
  const sourceRoot = existingLibraryRoot(sourceInput, "source");
  if (destinationRoot === sourceRoot) {
    throw new ArchiveError("ARCHIVE_CONFLICT", "Source and destination Library are the same.", {
      libraryRoot: destinationRoot,
    });
  }
  assertMergeReady(sourceRoot, "source");
  assertMergeReady(destinationRoot, "destination");
  assertValidLibrary(sourceRoot, "source");
  assertValidLibrary(destinationRoot, "destination");

  const sourceMarkers = readCommitMarkers(sourceRoot);
  const destinationMarkers = readCommitMarkers(destinationRoot);
  const destinationPaths = readCommittedPathIndex(destinationRoot);
  const destinationIdentities = collectIdentities(destinationRoot, destinationMarkers);
  const imported = emptyCounts();
  const reused = emptyCounts();
  const plannedRecords: PlannedRecord[] = [];
  const sourceRecordPaths: string[] = [];
  const newCreationIds = new Set<string>();
  const existingCreationIds = new Set<string>();
  const newAssetHashes = new Set<string>();
  const existingAssetHashes = new Set<string>();

  for (const marker of sourceMarkers) {
    for (const record of marker.records) {
      const sourcePath = resolveManagedPath(sourceRoot, record.path);
      sourceRecordPaths.push(sourcePath);
      const owner = destinationPaths.get(record.path);
      const identity = readIdentity(sourcePath, record.kind);
      if (identity) {
        const existing = destinationIdentities.get(`${record.kind}:${identity}`);
        if (existing && (existing.path !== record.path || existing.sha256 !== record.sha256)) {
          throw identityConflict(record.kind, identity, existing, record);
        }
      }
      if (owner) {
        if (owner.sha256 !== record.sha256) {
          throw new ArchiveError("ARCHIVE_CONFLICT", "Committed path has different content.", {
            relativePath: record.path,
            sourceSha256: record.sha256,
            destinationSha256: owner.sha256,
          });
        }
        increment(reused, record.kind);
        rememberEntity(record, identity, existingCreationIds, existingAssetHashes);
        continue;
      }
      plannedRecords.push({ ...record, sourcePath });
      increment(imported, record.kind);
      rememberEntity(record, identity, newCreationIds, newAssetHashes);
    }
  }

  const mutableRecords: PlannedRecord[] = [];
  const snapshot: SnapshotEntry[] = [
    snapshotEntry(sourceRoot, "library.json"),
    ...sourceMarkers.map((marker) =>
      snapshotEntry(sourceRoot, `archive/commits/${marker.id}.json`),
    ),
    ...sourceRecordPaths.map(snapshotAbsolute),
  ];

  for (const creationId of newCreationIds) {
    addMutableIfPresent(
      sourceRoot,
      `curation/creations/${creationId}.json`,
      mutableRecords,
      snapshot,
    );
    for (const filename of MUTABLE_PATHS) {
      addMutableIfPresent(
        sourceRoot,
        `creations/${creationId}/${filename}`,
        mutableRecords,
        snapshot,
      );
    }
  }
  for (const assetSha256 of newAssetHashes) {
    addMutableIfPresent(
      sourceRoot,
      `curation/images/${assetSha256}.json`,
      mutableRecords,
      snapshot,
    );
  }

  let preservedDestinationCuration = 0;
  let preservedDestinationDraft = 0;
  for (const creationId of existingCreationIds) {
    if (
      mutableDiffers(sourceRoot, destinationRoot, `curation/creations/${creationId}.json`, snapshot)
    ) {
      preservedDestinationCuration += 1;
    }
    if (
      MUTABLE_PATHS.some((filename) =>
        mutableDiffers(
          sourceRoot,
          destinationRoot,
          `creations/${creationId}/${filename}`,
          snapshot,
        ),
      )
    ) {
      preservedDestinationDraft += 1;
    }
  }
  for (const assetSha256 of existingAssetHashes) {
    if (
      mutableDiffers(sourceRoot, destinationRoot, `curation/images/${assetSha256}.json`, snapshot)
    ) {
      preservedDestinationCuration += 1;
    }
  }

  const baseResult = {
    sourceLibraryRoot: sourceRoot,
    destinationLibraryRoot: destinationRoot,
    imported,
    reused,
    preservedDestinationCuration,
    preservedDestinationDraft,
    ignoredInboxFileCount: countInboxFiles(sourceRoot),
  };
  if (options.dryRun || plannedRecords.length === 0) {
    return {
      dryRun: options.dryRun ?? false,
      applied: false,
      ...baseResult,
      transactionId: null,
    };
  }

  const transaction = createTransaction(destinationRoot, { operation: "merge_library" }, options);
  stageRecordFiles(
    destinationRoot,
    transaction.id,
    plannedRecords.map((record) => ({
      kind: record.kind,
      relativePath: record.path,
      sourcePath: record.sourcePath,
      sha256: record.sha256,
    })),
    options,
  );
  stageMergeMutableFiles(
    destinationRoot,
    transaction.id,
    mutableRecords.map((record) => ({
      relativePath: record.path,
      sourcePath: record.sourcePath,
      sha256: record.sha256,
    })),
    options,
  );
  assertSnapshotUnchanged(sourceRoot, snapshot);
  transitionTransaction(destinationRoot, transaction.id, "ready_to_commit", {}, options);
  commitTransaction(destinationRoot, transaction.id, options);
  return {
    dryRun: false,
    applied: true,
    ...baseResult,
    transactionId: transaction.id,
  };
}

function existingLibraryRoot(path: string, role: "source" | "destination"): string {
  if (!pathExists(path)) {
    throw new ArchiveError("LIBRARY_NOT_FOUND", `${role} Library path does not exist.`, {
      libraryRoot: path,
    });
  }
  const root = realpathSync(path);
  if (!lstatSync(root).isDirectory()) {
    throw new ArchiveError("LIBRARY_CONFIG_INVALID", `${role} Library path is not a directory.`, {
      libraryRoot: root,
    });
  }
  return root;
}

function assertValidLibrary(root: string, role: "source" | "destination"): void {
  const report = validateLibrary(root, "full");
  if (!report.valid) {
    throw new ArchiveError("ARCHIVE_CORRUPTION", `${role} Library failed validation.`, {
      libraryRoot: root,
      diagnostics: report.diagnostics,
    });
  }
}

function assertMergeReady(root: string, role: "source" | "destination"): void {
  const recovery = listRecoveryTransactions(root);
  const quarantineRoot = resolveManagedPath(root, ".quarantine");
  const quarantineCount = pathExists(quarantineRoot) ? readdirSync(quarantineRoot).length : 0;
  const lockPresent = pathExists(resolveManagedPath(root, ".locks/archive.lock"));
  if (recovery.length > 0 || quarantineCount > 0 || lockPresent) {
    throw new ArchiveError("RECOVERY_NOT_ALLOWED", `${role} Library requires recovery.`, {
      libraryRoot: root,
      recoveryCount: recovery.length,
      quarantineCount,
      lockPresent,
    });
  }
}

function collectIdentities(root: string, markers: CommitMarker[]): Map<string, IdentityEntry> {
  const result = new Map<string, IdentityEntry>();
  for (const marker of markers) {
    for (const record of marker.records) {
      const identity = readIdentity(resolveManagedPath(root, record.path), record.kind);
      if (!identity) continue;
      const key = `${record.kind}:${identity}`;
      const existing = result.get(key);
      if (existing && (existing.path !== record.path || existing.sha256 !== record.sha256)) {
        throw identityConflict(record.kind, identity, existing, record);
      }
      result.set(key, { path: record.path, sha256: record.sha256 });
    }
  }
  return result;
}

function readIdentity(path: string, kind: CommitRecordKind): string | null {
  if (kind === "image_asset") return sha256Bytes(readFileSync(path));
  if (kind === "prompt") return null;
  const value = JSON.parse(readFileSync(path, "utf8")) as { id?: unknown };
  return typeof value.id === "string" ? value.id : null;
}

function identityConflict(
  kind: CommitRecordKind,
  identity: string,
  destination: IdentityEntry,
  source: { path: string; sha256: string },
): ArchiveError {
  return new ArchiveError("ARCHIVE_CONFLICT", "Entity identity has different content.", {
    kind,
    identity,
    sourcePath: source.path,
    sourceSha256: source.sha256,
    destinationPath: destination.path,
    destinationSha256: destination.sha256,
  });
}

function rememberEntity(
  record: { kind: CommitRecordKind; path: string; sha256: string },
  identity: string | null,
  creationIds: Set<string>,
  assetHashes: Set<string>,
): void {
  if (record.kind === "creation" && identity) creationIds.add(identity);
  if (record.kind === "image_asset") assetHashes.add(record.sha256);
}

function addMutableIfPresent(
  root: string,
  relativePath: string,
  records: PlannedRecord[],
  snapshot: SnapshotEntry[],
): void {
  const sourcePath = resolveManagedPath(root, relativePath);
  if (!pathExists(sourcePath)) return;
  const entry = snapshotAbsolute(sourcePath);
  records.push({ kind: "prompt", path: relativePath, sha256: entry.sha256, sourcePath });
  snapshot.push(entry);
}

function mutableDiffers(
  sourceRoot: string,
  destinationRoot: string,
  relativePath: string,
  snapshot: SnapshotEntry[],
): boolean {
  const sourcePath = resolveManagedPath(sourceRoot, relativePath);
  if (!pathExists(sourcePath)) return false;
  const source = snapshotAbsolute(sourcePath);
  snapshot.push(source);
  const destinationPath = resolveManagedPath(destinationRoot, relativePath);
  return (
    !pathExists(destinationPath) || sha256Bytes(readFileSync(destinationPath)) !== source.sha256
  );
}

function snapshotEntry(root: string, relativePath: string): SnapshotEntry {
  return snapshotAbsolute(resolveManagedPath(root, relativePath));
}

function snapshotAbsolute(path: string): SnapshotEntry {
  return { path, sha256: sha256Bytes(readFileSync(path)) };
}

function assertSnapshotUnchanged(root: string, entries: SnapshotEntry[]): void {
  for (const entry of entries) {
    if (!pathExists(entry.path) || sha256Bytes(readFileSync(entry.path)) !== entry.sha256) {
      throw new ArchiveError("ARCHIVE_CONFLICT", "Source Library changed during merge.", {
        libraryRoot: root,
        sourcePath: entry.path,
      });
    }
  }
}

function countInboxFiles(root: string): number {
  const inbox = resolveManagedPath(root, "inbox");
  if (!pathExists(inbox)) return 0;
  return countFiles(inbox);
}

function countFiles(directory: string): number {
  let count = 0;
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const status = lstatSync(path);
    if (status.isSymbolicLink()) {
      throw new ArchiveError("ARCHIVE_SYMLINK_FORBIDDEN", "Inbox contains a symbolic link.");
    }
    count += status.isDirectory() ? countFiles(path) : status.isFile() ? 1 : 0;
  }
  return count;
}

function emptyCounts(): MergeCounts {
  return { creations: 0, revisions: 0, generations: 0, imageAssets: 0 };
}

function increment(counts: MergeCounts, kind: CommitRecordKind): void {
  const key = countKey(kind);
  if (key) counts[key] += 1;
}

function countKey(kind: CommitRecordKind): CountKey | null {
  if (kind === "creation") return "creations";
  if (kind === "revision") return "revisions";
  if (kind === "generation") return "generations";
  if (kind === "image_asset") return "imageAssets";
  return null;
}
