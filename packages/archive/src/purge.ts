import {
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  statfsSync,
  unlinkSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import {
  ArchiveError,
  isLowercaseSha256,
  type CommitMarker,
  type GenerationRecord,
  type PurgeJournal,
  type PurgePlan,
  type PurgeRecoveryEvidence,
  type PurgeTarget,
  type TransactionRecord,
} from "@text-to-image/domain";
import {
  jsonBytes,
  readJson,
  sha256Bytes,
  syncDirectory,
  writeBytesExclusive,
  writeJsonAtomic,
} from "./internal.js";
import { assertLibraryValid, readCommitMarkers, readLibraryManifest } from "./validator.js";

export interface PreparePurgeOptions {
  abandonRecoveryTransactionIds?: string[];
}

export interface ExecutePurgeRequest extends PreparePurgeOptions {
  planDigest: string;
  confirmation: string;
}

export interface ExecutePurgeResult {
  operationId: string;
  target: PurgeTarget;
  deletedPathCount: number;
  deletedByteCount: number;
  retainedAssetCount: number;
}

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const PURGE_NAME_PATTERN = /^\.text-to-image-purge-([a-f0-9-]{36})\.json$/u;

export function creationPurgeTarget(creationId: string): PurgeTarget {
  if (!UUID_PATTERN.test(creationId)) {
    throw new ArchiveError("ARCHIVE_SCHEMA_INVALID", "Creation Purge requires a lowercase UUID.", {
      creationId,
    });
  }
  return { kind: "creation", creationId };
}

export function imagePurgeTarget(assetSha256: string): PurgeTarget {
  if (!isLowercaseSha256(assetSha256)) {
    throw new ArchiveError(
      "ARCHIVE_SCHEMA_INVALID",
      "Image Asset Purge requires a SHA-256 hex digest.",
      {
        assetSha256,
      },
    );
  }
  return { kind: "image", assetSha256 };
}

export function preparePurge(
  libraryRootInput: string,
  target: PurgeTarget,
  options: PreparePurgeOptions = {},
): PurgePlan {
  const libraryRoot = resolve(libraryRootInput);
  assertLibraryValid(libraryRoot, "full");
  assertNoPurgeJournal(libraryRoot);
  const manifest = readLibraryManifest(libraryRoot);
  const markers = readCommitMarkers(libraryRoot);
  const abandoned = normalizeTransactionIds(options.abandonRecoveryTransactionIds ?? []);
  const committed = markers.flatMap((marker) => marker.records);
  const generationRecords = readGenerationRecords(libraryRoot, markers);
  const deletePaths = new Set<string>();
  const retainedAssets = new Set<string>();
  const blockingRelations: PurgePlan["blockingRelations"] = [];

  if (target.kind === "creation") {
    const prefix = `creations/${target.creationId}/`;
    if (!committed.some((record) => record.path === `${prefix}creation.json`)) {
      throw new ArchiveError("PURGE_TARGET_NOT_FOUND", "Creation was not found.", {
        creationId: target.creationId,
      });
    }
    for (const record of committed) {
      if (record.path.startsWith(prefix)) deletePaths.add(record.path);
    }
    deletePaths.add(`creations/${target.creationId}`);
    deletePaths.add(`curation/creations/${target.creationId}.json`);
    for (const generation of generationRecords) {
      if (generation.creationId !== target.creationId) continue;
      generation.references.forEach((reference) => retainedAssets.add(reference.assetSha256));
      generation.outputs.forEach((output) => retainedAssets.add(output.assetSha256));
    }
  } else {
    const assetRecords = committed.filter(
      (record) =>
        record.kind === "image_asset" && assetFromPath(record.path) === target.assetSha256,
    );
    if (assetRecords.length === 0) {
      throw new ArchiveError("PURGE_TARGET_NOT_FOUND", "Image Asset was not found.", {
        assetSha256: target.assetSha256,
      });
    }
    assetRecords.forEach((record) => deletePaths.add(record.path));
    deletePaths.add(`curation/images/${target.assetSha256}.json`);
    for (const generation of generationRecords) {
      if (generation.outputs.some((output) => output.assetSha256 === target.assetSha256)) {
        blockingRelations.push({
          creationId: generation.creationId,
          generationId: generation.id,
          relationType: "output",
        });
      }
      if (generation.references.some((reference) => reference.assetSha256 === target.assetSha256)) {
        blockingRelations.push({
          creationId: generation.creationId,
          generationId: generation.id,
          relationType: "reference",
        });
      }
    }
  }

  const recoveryEvidence = findRecoveryEvidence(libraryRoot, target, abandoned);
  const evidenceIds = new Set(recoveryEvidence.map((item) => item.transactionId));
  const unknownAbandonment = abandoned.filter((id) => !evidenceIds.has(id));
  if (unknownAbandonment.length > 0) {
    throw new ArchiveError(
      "ARCHIVE_SCHEMA_INVALID",
      "Recovery Evidence Abandonment contains a transaction outside this Purge Plan.",
      { transactionIds: unknownAbandonment },
    );
  }
  const blockingRecovery = recoveryEvidence.filter(
    (item) => !abandoned.includes(item.transactionId),
  );
  const snapshotDigest = snapshotDigestFor(libraryRoot);
  const sortedDeletePaths = [...deletePaths].sort();
  const warnings = target.kind === "image" ? inboxWarnings(libraryRoot, target.assetSha256) : [];
  const base = {
    schemaVersion: 1 as const,
    target,
    libraryId: manifest.libraryId,
    snapshotDigest,
    confirmationPhrase:
      target.kind === "creation"
        ? `PURGE CREATION ${target.creationId}`
        : `PURGE IMAGE ${target.assetSha256}`,
    executable: blockingRelations.length === 0 && blockingRecovery.length === 0,
    deletePaths: sortedDeletePaths,
    retainedAssetSha256: [...retainedAssets].sort(),
    blockingRelations: blockingRelations.sort(compareRelations),
    recoveryEvidence: recoveryEvidence.sort(compareRecoveryEvidence),
    abandonedRecoveryTransactionIds: abandoned,
    warnings,
    deleteByteCount: sumExistingPathBytes(libraryRoot, sortedDeletePaths),
    fallbackCopyByteCount: sumCopyBytes(libraryRoot, sortedDeletePaths, abandoned),
  };
  return { ...base, planDigest: sha256Bytes(canonicalJson(base)) };
}

export function executePurge(
  libraryRootInput: string,
  target: PurgeTarget,
  request: ExecutePurgeRequest,
): ExecutePurgeResult {
  const libraryRoot = resolve(libraryRootInput);
  const lockPath = join(libraryRoot, ".locks", "archive.lock");
  mkdirSync(dirname(lockPath), { recursive: true });
  try {
    writeBytesExclusive(lockPath, jsonBytes({ schemaVersion: 1, pid: process.pid }));
  } catch (error) {
    throw new ArchiveError("PURGE_MAINTENANCE_ACTIVE", "A Library mutation is already active.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const plan = preparePurge(libraryRoot, target, {
      ...(request.abandonRecoveryTransactionIds
        ? { abandonRecoveryTransactionIds: request.abandonRecoveryTransactionIds }
        : {}),
    });
    if (request.confirmation !== plan.confirmationPhrase) {
      throw new ArchiveError(
        "PURGE_CONFIRMATION_MISMATCH",
        "Purge confirmation phrase does not match the prepared plan.",
        { expected: plan.confirmationPhrase },
      );
    }
    if (request.planDigest !== plan.planDigest) {
      throw new ArchiveError("PURGE_PLAN_STALE", "Purge Plan is stale; prepare it again.", {
        expectedPlanDigest: plan.planDigest,
      });
    }
    if (plan.blockingRelations.length > 0) {
      throw new ArchiveError(
        "PURGE_REFERENCE_BLOCKED",
        "Image Asset is still used by a Generation.",
        { relations: plan.blockingRelations },
      );
    }
    const unconfirmedEvidence = plan.recoveryEvidence.filter(
      (item) => !plan.abandonedRecoveryTransactionIds.includes(item.transactionId),
    );
    if (unconfirmedEvidence.length > 0) {
      throw new ArchiveError(
        "PURGE_RECOVERY_BLOCKED",
        "Recovery evidence must be resolved or explicitly abandoned.",
        { recoveryEvidence: unconfirmedEvidence },
      );
    }
    assertEnoughSpace(libraryRoot, plan.fallbackCopyByteCount);
    return replaceLibrary(libraryRoot, plan);
  } finally {
    if (existsSync(lockPath)) unlinkSync(lockPath);
  }
}

export function readPurgeStatus(
  libraryRootInput: string,
  operationId?: string,
): PurgeJournal | null {
  const journals = findPurgeJournals(resolve(libraryRootInput));
  if (!operationId) return journals[0] ?? null;
  return journals.find((journal) => journal.operationId === operationId) ?? null;
}

export function recoverPurge(libraryRootInput: string): PurgeJournal | null {
  const libraryRoot = resolve(libraryRootInput);
  const journal = readPurgeStatus(libraryRoot);
  if (!journal) return null;
  assertJournalPaths(journal, libraryRoot);
  if (journal.phase === "preparing_candidate" || journal.phase === "candidate_ready") {
    if (existsSync(libraryRoot)) {
      removeTreeSafely(journal.candidateRoot);
      unlinkSync(journalPath(journal));
      return null;
    }
    if (existsSync(journal.retiredRoot) && existsSync(journal.candidateRoot)) {
      updateJournal(journal, "original_retired");
    } else {
      throw new ArchiveError(
        "PURGE_RECOVERY_REQUIRED",
        "Purge recovery paths do not match a safe pre-cutover or cutover state.",
        { operationId: journal.operationId },
      );
    }
  }
  if (journal.phase === "original_retired") {
    if (!existsSync(libraryRoot) && existsSync(journal.candidateRoot)) {
      renameSync(journal.candidateRoot, libraryRoot);
      updateJournal(journal, "replacement_active");
    } else if (existsSync(libraryRoot) && !existsSync(journal.candidateRoot)) {
      assertLibraryValid(libraryRoot, "full", true);
      updateJournal(journal, "replacement_active");
    }
  }
  if (journal.phase === "replacement_active") {
    assertLibraryValid(libraryRoot, "full", true);
    removeTreeSafely(journal.retiredRoot);
    updateJournal(journal, "retired_removed");
  }
  if (journal.phase === "retired_removed" || journal.phase === "index_ready") {
    assertLibraryValid(libraryRoot, "full", true);
    removeTreeSafely(join(libraryRoot, ".cache"));
    updateJournal(journal, "index_ready");
    unlinkSync(journalPath(journal));
    return null;
  }
  return journal;
}

function replaceLibrary(libraryRoot: string, plan: PurgePlan): ExecutePurgeResult {
  const operationId = randomUUID();
  const parent = dirname(libraryRoot);
  const stem = `.text-to-image-purge-${operationId}`;
  const candidateRoot = join(parent, `${stem}.candidate`);
  const retiredRoot = join(parent, `${stem}.retired`);
  const journal: PurgeJournal = {
    schemaVersion: 1,
    operationId,
    libraryRoot,
    candidateRoot,
    retiredRoot,
    target: plan.target,
    planDigest: plan.planDigest,
    phase: "preparing_candidate",
    updatedAt: new Date().toISOString(),
  };
  writeBytesExclusive(journalPath(journal), jsonBytes(journal));
  try {
    mkdirSync(candidateRoot, { mode: 0o700 });
    copyCandidate(libraryRoot, candidateRoot, plan);
    rewriteCommitMarkers(candidateRoot, plan);
    assertLibraryValid(candidateRoot, "full");
    assertTargetAbsent(candidateRoot, plan.target);
    updateJournal(journal, "candidate_ready");
    renameSync(libraryRoot, retiredRoot);
    syncDirectory(parent);
    updateJournal(journal, "original_retired");
    renameSync(candidateRoot, libraryRoot);
    syncDirectory(parent);
    updateJournal(journal, "replacement_active");
    assertLibraryValid(libraryRoot, "full", true);
    removeTreeSafely(retiredRoot);
    updateJournal(journal, "retired_removed");
    removeTreeSafely(join(libraryRoot, ".cache"));
    updateJournal(journal, "index_ready");
    unlinkSync(journalPath(journal));
    return {
      operationId,
      target: plan.target,
      deletedPathCount: plan.deletePaths.length,
      deletedByteCount: plan.deleteByteCount,
      retainedAssetCount: plan.retainedAssetSha256.length,
    };
  } catch (error) {
    if (journal.phase === "preparing_candidate" || journal.phase === "candidate_ready") {
      removeTreeSafely(candidateRoot);
      if (existsSync(journalPath(journal))) unlinkSync(journalPath(journal));
    }
    throw error;
  }
}

function copyCandidate(sourceRoot: string, candidateRoot: string, plan: PurgePlan): void {
  const excluded = new Set(plan.deletePaths);
  for (const transactionId of plan.abandonedRecoveryTransactionIds) {
    excluded.add(`.staging/${transactionId}`);
    for (const name of safeReadDirectory(join(sourceRoot, ".quarantine"))) {
      if (name.startsWith(transactionId)) excluded.add(`.quarantine/${name}`);
    }
  }
  copyDirectory(sourceRoot, candidateRoot, "", (relativePath) => {
    if (relativePath === ".cache" || relativePath.startsWith(".cache/")) return false;
    if (relativePath === ".locks" || relativePath.startsWith(".locks/")) return false;
    if (relativePath === "archive/commits" || relativePath.startsWith("archive/commits/"))
      return false;
    return ![...excluded].some(
      (path) => relativePath === path || relativePath.startsWith(`${path}/`),
    );
  });
}

function copyDirectory(
  sourceRoot: string,
  destinationRoot: string,
  relativePath: string,
  include: (relativePath: string) => boolean,
): void {
  const source = relativePath ? join(sourceRoot, ...relativePath.split("/")) : sourceRoot;
  for (const name of readdirSync(source)) {
    const childRelative = relativePath ? `${relativePath}/${name}` : name;
    if (!include(childRelative)) continue;
    const from = join(source, name);
    const to = join(destinationRoot, ...childRelative.split("/"));
    const status = lstatSync(from);
    if (status.isSymbolicLink()) {
      throw new ArchiveError(
        "ARCHIVE_SYMLINK_FORBIDDEN",
        "Purge candidate cannot copy a symbolic link.",
        {
          relativePath: childRelative,
        },
      );
    }
    if (status.isDirectory()) {
      mkdirSync(to, { recursive: true, mode: status.mode });
      copyDirectory(sourceRoot, destinationRoot, childRelative, include);
    } else if (status.isFile()) {
      mkdirSync(dirname(to), { recursive: true });
      if (childRelative.startsWith("assets/sha256/")) {
        try {
          linkSync(from, to);
          continue;
        } catch {
          // Cross-device and unsupported filesystems use the planned byte-copy fallback.
        }
      }
      copyFileSync(from, to);
    }
  }
}

function rewriteCommitMarkers(candidateRoot: string, plan: PurgePlan): void {
  const sourceMarkers = readCommitMarkers(planRootFromCandidate(candidateRoot));
  const commitsRoot = join(candidateRoot, "archive", "commits");
  mkdirSync(commitsRoot, { recursive: true });
  for (const marker of sourceMarkers) {
    const records = marker.records.filter(
      (record) =>
        !plan.deletePaths.some(
          (path) => record.path === path || record.path.startsWith(`${path}/`),
        ),
    );
    if (records.length === 0) continue;
    writeJsonAtomic(join(commitsRoot, `${marker.id}.json`), { ...marker, records });
  }
}

function planRootFromCandidate(candidateRoot: string): string {
  const match = basename(candidateRoot).match(/^\.text-to-image-purge-[a-f0-9-]{36}\.candidate$/u);
  if (!match)
    throw new ArchiveError("ARCHIVE_PATH_ESCAPE", "Candidate path is not a Purge sibling.");
  const journals = safeReadDirectory(dirname(candidateRoot)).filter((name) =>
    PURGE_NAME_PATTERN.test(name),
  );
  for (const name of journals) {
    const value = readJson(join(dirname(candidateRoot), name)) as PurgeJournal;
    if (value.candidateRoot === candidateRoot) return value.libraryRoot;
  }
  throw new ArchiveError("PURGE_RECOVERY_REQUIRED", "Purge journal for candidate was not found.");
}

function snapshotDigestFor(root: string): string {
  const entries: Array<[string, string]> = [];
  walkFiles(root, "", (relativePath, absolutePath) => {
    if (
      relativePath.startsWith(".cache/") ||
      relativePath.startsWith(".locks/") ||
      relativePath.startsWith("inbox/")
    )
      return;
    entries.push([relativePath, sha256Bytes(readFileSync(absolutePath))]);
  });
  return sha256Bytes(canonicalJson(entries.sort(([a], [b]) => a.localeCompare(b))));
}

function readGenerationRecords(root: string, markers: CommitMarker[]): GenerationRecord[] {
  return markers
    .flatMap((marker) => marker.records)
    .filter((record) => record.kind === "generation")
    .map(
      (record) =>
        JSON.parse(readFileSync(join(root, ...record.path.split("/")), "utf8")) as GenerationRecord,
    );
}

function findRecoveryEvidence(
  root: string,
  target: PurgeTarget,
  explicitlySelectedTransactionIds: string[],
): PurgeRecoveryEvidence[] {
  const evidence: PurgeRecoveryEvidence[] = [];
  const committedTransactionIds = new Set(readCommitMarkers(root).map((marker) => marker.id));
  for (const location of [".staging", ".quarantine"] as const) {
    for (const name of safeReadDirectory(join(root, location))) {
      const directory = join(root, location, name);
      if (!lstatSync(directory).isDirectory()) continue;
      const transaction = findTransactionRecord(directory);
      const transactionId = transaction?.id ?? name.slice(0, 36);
      if (!UUID_PATTERN.test(transactionId)) continue;
      const explicitlySelected = explicitlySelectedTransactionIds.includes(transactionId);
      if (
        !explicitlySelected &&
        (!transaction || !transactionBelongsToTarget(transaction, target))
      ) {
        continue;
      }
      if (location === ".staging" && committedTransactionIds.has(transactionId)) continue;
      evidence.push({
        transactionId,
        location: location === ".staging" ? "staging" : "quarantine",
        state: transaction?.state ?? "malformed",
        byteCount: directoryBytes(directory),
      });
    }
  }
  return evidence;
}

function findTransactionRecord(directory: string): TransactionRecord | null {
  const direct = join(directory, "transaction.json");
  if (!existsSync(direct)) return null;
  try {
    return readJson(direct) as TransactionRecord;
  } catch {
    return null;
  }
}

function transactionBelongsToTarget(transaction: TransactionRecord, target: PurgeTarget): boolean {
  if (target.kind === "creation") return transaction.creationId === target.creationId;
  return transaction.stagedRecords.some(
    (record) => record.kind === "image_asset" && assetFromPath(record.path) === target.assetSha256,
  );
}

function inboxWarnings(root: string, assetSha256: string): string[] {
  const inbox = join(root, "inbox");
  if (!existsSync(inbox)) return [];
  const matches: string[] = [];
  walkFiles(inbox, "", (relativePath, absolutePath) => {
    if (sha256Bytes(readFileSync(absolutePath)) === assetSha256) matches.push(relativePath);
  });
  return matches
    .sort()
    .map((path) => `Inbox file has identical content and will be preserved: ${path}`);
}

function assertTargetAbsent(root: string, target: PurgeTarget): void {
  const paths = readCommitMarkers(root).flatMap((marker) =>
    marker.records.map((record) => record.path),
  );
  const present =
    target.kind === "creation"
      ? paths.some((path) => path.startsWith(`creations/${target.creationId}/`))
      : paths.some((path) => assetFromPath(path) === target.assetSha256);
  if (present)
    throw new ArchiveError("PURGE_CLEANUP_FAILED", "Purge target remains in candidate Library.");
}

function assertEnoughSpace(root: string, requiredBytes: number): void {
  const stats = statfsSync(dirname(root));
  const available = Number(stats.bavail) * Number(stats.bsize);
  if (available < requiredBytes) {
    throw new ArchiveError(
      "PURGE_INSUFFICIENT_SPACE",
      "Insufficient disk space for Purge candidate.",
      {
        requiredBytes,
        availableBytes: available,
      },
    );
  }
}

function assertNoPurgeJournal(root: string): void {
  const journal = readPurgeStatus(root);
  if (journal) {
    throw new ArchiveError("PURGE_RECOVERY_REQUIRED", "An interrupted Purge requires recovery.", {
      operationId: journal.operationId,
      phase: journal.phase,
    });
  }
}

function findPurgeJournals(root: string): PurgeJournal[] {
  const parent = dirname(root);
  return safeReadDirectory(parent)
    .filter((name) => PURGE_NAME_PATTERN.test(name))
    .map((name) => {
      try {
        return readJson(join(parent, name)) as PurgeJournal;
      } catch {
        return null;
      }
    })
    .filter((value): value is PurgeJournal => value !== null && resolve(value.libraryRoot) === root)
    .sort((a, b) => a.operationId.localeCompare(b.operationId));
}

function assertJournalPaths(journal: PurgeJournal, libraryRoot: string): void {
  const parent = dirname(libraryRoot);
  const canonicalParent = realpathSync(parent);
  for (const candidate of [journal.candidateRoot, journal.retiredRoot, journalPath(journal)]) {
    if (
      realpathSync(dirname(resolve(candidate))) !== canonicalParent ||
      lstatIfPresent(candidate)?.isSymbolicLink()
    ) {
      throw new ArchiveError(
        "ARCHIVE_PATH_ESCAPE",
        "Purge journal contains an unsafe sibling path.",
      );
    }
  }
}

function updateJournal(journal: PurgeJournal, phase: PurgeJournal["phase"]): void {
  journal.phase = phase;
  journal.updatedAt = new Date().toISOString();
  writeJsonAtomic(journalPath(journal), journal);
  syncDirectory(dirname(journalPath(journal)));
}

function journalPath(journal: PurgeJournal): string {
  return join(dirname(journal.libraryRoot), `.text-to-image-purge-${journal.operationId}.json`);
}

function removeTreeSafely(path: string): void {
  if (!existsSync(path)) return;
  const status = lstatSync(path);
  if (status.isSymbolicLink()) {
    throw new ArchiveError(
      "ARCHIVE_SYMLINK_FORBIDDEN",
      "Purge cleanup target is a symbolic link.",
      {
        path: basename(path),
      },
    );
  }
  if (!status.isDirectory()) {
    unlinkSync(path);
    return;
  }
  for (const name of readdirSync(path)) removeTreeSafely(join(path, name));
  rmdirSync(path);
}

function walkFiles(
  root: string,
  relativePath: string,
  visit: (relativePath: string, absolutePath: string) => void,
): void {
  const directory = relativePath ? join(root, ...relativePath.split("/")) : root;
  for (const name of safeReadDirectory(directory)) {
    const childRelative = relativePath ? `${relativePath}/${name}` : name;
    const absolutePath = join(directory, name);
    const status = lstatSync(absolutePath);
    if (status.isSymbolicLink()) {
      throw new ArchiveError(
        "ARCHIVE_SYMLINK_FORBIDDEN",
        "Managed tree contains a symbolic link.",
        {
          relativePath: childRelative,
        },
      );
    }
    if (status.isDirectory()) walkFiles(root, childRelative, visit);
    else if (status.isFile()) visit(childRelative, absolutePath);
  }
}

function directoryBytes(path: string): number {
  let total = 0;
  walkFiles(path, "", (_relativePath, absolutePath) => {
    total += statSync(absolutePath).size;
  });
  return total;
}

function sumExistingPathBytes(root: string, paths: string[]): number {
  const counted = new Set<string>();
  let total = 0;
  for (const relativePath of paths) {
    const absolutePath = join(root, ...relativePath.split("/"));
    if (!existsSync(absolutePath)) continue;
    const status = lstatSync(absolutePath);
    if (status.isFile() && !counted.has(absolutePath)) {
      counted.add(absolutePath);
      total += status.size;
    } else if (status.isDirectory()) {
      walkFiles(absolutePath, "", (_path, file) => {
        if (!counted.has(file)) {
          counted.add(file);
          total += statSync(file).size;
        }
      });
    }
  }
  return total;
}

function sumCopyBytes(root: string, deletePaths: string[], abandoned: string[]): number {
  const excluded = [...deletePaths, ".cache", ".locks", ...abandoned.map((id) => `.staging/${id}`)];
  let total = 0;
  walkFiles(root, "", (relativePath, absolutePath) => {
    if (excluded.some((path) => relativePath === path || relativePath.startsWith(`${path}/`)))
      return;
    total += statSync(absolutePath).size;
  });
  return total;
}

function assetFromPath(path: string): string | null {
  return (
    path.match(/^assets\/sha256\/[a-f0-9]{2}\/([a-f0-9]{64})\.(?:png|jpg|webp)$/u)?.[1] ?? null
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }
  return value;
}

function normalizeTransactionIds(values: string[]): string[] {
  const result = [...new Set(values)].sort();
  if (result.some((value) => !UUID_PATTERN.test(value))) {
    throw new ArchiveError(
      "ARCHIVE_SCHEMA_INVALID",
      "Recovery transaction IDs must be lowercase UUIDs.",
    );
  }
  return result;
}

function compareRelations(
  a: PurgePlan["blockingRelations"][number],
  b: PurgePlan["blockingRelations"][number],
): number {
  return `${a.creationId}:${a.generationId}:${a.relationType}`.localeCompare(
    `${b.creationId}:${b.generationId}:${b.relationType}`,
  );
}

function compareRecoveryEvidence(a: PurgeRecoveryEvidence, b: PurgeRecoveryEvidence): number {
  return `${a.transactionId}:${a.location}`.localeCompare(`${b.transactionId}:${b.location}`);
}

function safeReadDirectory(path: string): string[] {
  return existsSync(path) ? readdirSync(path).sort() : [];
}

function lstatIfPresent(path: string): ReturnType<typeof lstatSync> | null {
  return existsSync(path) ? lstatSync(path) : null;
}
