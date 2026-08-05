import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  ArchiveError,
  LIBRARY_FORMAT_VERSION,
  type CommitMarker,
  type GenerationRecord,
  type LibraryManifest,
  type PromptRevisionRecord,
  type ValidationDiagnostic,
  type ValidationReport,
} from "@text-to-image/domain";
import { createSchemaRegistry, RecordSchemaError, type SchemaKind } from "@text-to-image/schemas";
import { inspectImage } from "./image.js";
import { pathExists, readJson, resolveManagedPath, sha256Bytes } from "./internal.js";

const schemaRegistry = createSchemaRegistry();

export function readLibraryManifest(libraryRoot: string): LibraryManifest {
  const manifestPath = join(libraryRoot, "library.json");
  if (!pathExists(manifestPath)) {
    throw new ArchiveError(
      "ARCHIVE_NOT_INITIALIZED",
      "Library manifest does not exist.",
      { relativePath: "library.json" },
      "Run assetctl init for the resolved Library path.",
    );
  }
  const manifestStatus = lstatSync(manifestPath);
  if (!manifestStatus.isFile() || manifestStatus.isSymbolicLink()) {
    throw new ArchiveError(
      "ARCHIVE_SYMLINK_FORBIDDEN",
      "Library manifest must be a regular file.",
      { relativePath: "library.json" },
    );
  }
  const manifest = readJson(manifestPath);
  assertSchema("library", manifest, "library.json");
  const typedManifest = manifest as LibraryManifest;
  if (typedManifest.formatVersion !== LIBRARY_FORMAT_VERSION) {
    throw new ArchiveError(
      "ARCHIVE_UNSUPPORTED_FORMAT",
      "Library format version is not supported by this writer.",
      {
        actual: typedManifest.formatVersion,
        supported: LIBRARY_FORMAT_VERSION,
      },
    );
  }
  return typedManifest;
}

export function readCommitMarkers(libraryRoot: string): CommitMarker[] {
  const commitsDirectory = resolveManagedPath(libraryRoot, "archive/commits");
  if (!pathExists(commitsDirectory)) {
    return [];
  }
  return readdirSync(commitsDirectory)
    .filter((name) => name.endsWith(".json") && !name.startsWith("."))
    .sort()
    .map((name) => {
      const relativePath = `archive/commits/${name}`;
      const markerPath = join(commitsDirectory, name);
      const status = lstatSync(markerPath);
      if (!status.isFile() || status.isSymbolicLink()) {
        throw new ArchiveError(
          "ARCHIVE_SYMLINK_FORBIDDEN",
          "Commit Marker must be a regular file, not a symbolic link.",
          { relativePath },
        );
      }
      const value = readJson(markerPath);
      assertSchema("commit", value, relativePath);
      const marker = value as CommitMarker;
      if (`${marker.id}.json` !== name) {
        throw new ArchiveError(
          "ARCHIVE_CORRUPTION",
          "Commit Marker filename does not match its ID.",
          { relativePath },
        );
      }
      return marker;
    });
}

export function readCommittedPathIndex(
  libraryRoot: string,
): Map<string, { markerId: string; sha256: string }> {
  const index = new Map<string, { markerId: string; sha256: string }>();
  for (const marker of readCommitMarkers(libraryRoot)) {
    for (const record of marker.records) {
      const existing = index.get(record.path);
      if (existing) {
        throw new ArchiveError(
          "ARCHIVE_CORRUPTION",
          "An Archive path is introduced by more than one Commit Marker.",
          {
            relativePath: record.path,
            markerIds: [existing.markerId, marker.id],
          },
        );
      }
      index.set(record.path, { markerId: marker.id, sha256: record.sha256 });
    }
  }
  return index;
}

export function validateLibrary(
  libraryRootInput: string,
  mode: "quick" | "full" = "quick",
): ValidationReport {
  const diagnostics: ValidationDiagnostic[] = [];
  let manifest: LibraryManifest | null = null;
  let markers: CommitMarker[];
  const libraryRoot = pathExists(libraryRootInput)
    ? realpathSync(libraryRootInput)
    : libraryRootInput;

  try {
    manifest = readLibraryManifest(libraryRoot);
    markers = readCommitMarkers(libraryRoot);
  } catch (error) {
    diagnostics.push(toDiagnostic(error, "library.json"));
    return {
      valid: false,
      mode,
      manifest,
      committedRecordCount: 0,
      commitCount: 0,
      diagnostics,
    };
  }

  const selectedMarkers = mode === "quick" ? markers.slice(-1) : markers;
  const pathOwners = new Map<string, string>();
  const revisions = new Map<string, PromptRevisionRecord>();
  const generations = new Map<string, GenerationRecord>();
  const committedAssets = new Set<string>();

  for (const marker of selectedMarkers) {
    for (const record of marker.records) {
      const priorOwner = pathOwners.get(record.path);
      if (priorOwner) {
        diagnostics.push({
          code: "ARCHIVE_CORRUPTION",
          severity: "error",
          relativePath: record.path,
          message: `Path is introduced by both ${priorOwner} and ${marker.id}.`,
        });
        continue;
      }
      pathOwners.set(record.path, marker.id);
      try {
        validateCommittedRecord(
          libraryRoot,
          record.path,
          record.sha256,
          record.kind,
          revisions,
          generations,
          committedAssets,
        );
      } catch (error) {
        diagnostics.push(toDiagnostic(error, record.path));
      }
    }
  }

  if (mode === "full") {
    validateRelationships(
      libraryRoot,
      markers,
      revisions,
      generations,
      committedAssets,
      diagnostics,
    );
    scanManagedTrees(libraryRoot, pathOwners, diagnostics);
  }

  return {
    valid: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    mode,
    manifest,
    committedRecordCount: markers.reduce((count, marker) => count + marker.records.length, 0),
    commitCount: markers.length,
    diagnostics,
  };
}

export function assertLibraryValid(
  libraryRoot: string,
  mode: "quick" | "full" = "quick",
  allowPurgeMaintenance = false,
): void {
  if (!allowPurgeMaintenance) assertPurgeMaintenanceInactive(libraryRoot);
  const report = validateLibrary(libraryRoot, mode);
  if (!report.valid) {
    throw new ArchiveError(
      "ARCHIVE_CORRUPTION",
      "Asset Library validation failed.",
      { diagnostics: report.diagnostics },
      "Run assetctl validate --full and inspect the reported paths.",
    );
  }
}

function assertPurgeMaintenanceInactive(libraryRoot: string): void {
  const canonicalRoot = resolve(libraryRoot);
  const parent = dirname(canonicalRoot);
  if (!pathExists(parent)) return;
  for (const name of readdirSync(parent)) {
    if (!/^\.text-to-image-purge-[a-f0-9-]{36}\.json$/u.test(name)) continue;
    try {
      const value = readJson(join(parent, name)) as {
        libraryRoot?: unknown;
        operationId?: unknown;
      };
      if (typeof value.libraryRoot !== "string" || resolve(value.libraryRoot) !== canonicalRoot)
        continue;
      throw new ArchiveError(
        "PURGE_MAINTENANCE_ACTIVE",
        "The Asset Library is in Purge maintenance.",
        { operationId: typeof value.operationId === "string" ? value.operationId : null },
      );
    } catch (error) {
      if (error instanceof ArchiveError) throw error;
    }
  }
}

export function assertRecordSchema(kind: SchemaKind, value: unknown, relativePath: string): void {
  assertSchema(kind, value, relativePath);
}

function validateCommittedRecord(
  root: string,
  relativePath: string,
  expectedSha256: string,
  kind: CommitMarker["records"][number]["kind"],
  revisions: Map<string, PromptRevisionRecord>,
  generations: Map<string, GenerationRecord>,
  assets: Set<string>,
): void {
  const absolutePath = resolveManagedPath(root, relativePath);
  if (!pathExists(absolutePath)) {
    throw new ArchiveError("ARCHIVE_CORRUPTION", "Committed record is missing.", { relativePath });
  }
  const status = lstatSync(absolutePath);
  if (status.isSymbolicLink()) {
    throw new ArchiveError(
      "ARCHIVE_SYMLINK_FORBIDDEN",
      "Managed Archive record must not be a symbolic link.",
      { relativePath },
    );
  }
  if (!status.isFile()) {
    throw new ArchiveError("ARCHIVE_CORRUPTION", "Committed record is not a regular file.", {
      relativePath,
    });
  }
  const bytes = readFileSync(absolutePath);
  const actualSha256 = sha256Bytes(bytes);
  if (actualSha256 !== expectedSha256) {
    throw new ArchiveError(
      "ARCHIVE_HASH_MISMATCH",
      "Archived object does not match its committed digest.",
      { relativePath, expectedSha256, actualSha256 },
    );
  }

  if (kind === "image_asset") {
    inspectImage(bytes, absolutePath);
    const filenameHash = relativePath.split("/").at(-1)?.split(".")[0];
    if (filenameHash !== actualSha256) {
      throw new ArchiveError(
        "ARCHIVE_HASH_MISMATCH",
        "Image Asset path does not match its content identity.",
        { relativePath, actualSha256 },
      );
    }
    assets.add(actualSha256);
    return;
  }
  if (kind === "prompt") {
    return;
  }

  const value = JSON.parse(bytes.toString("utf8")) as unknown;
  const schemaKind = schemaKindForRecord(kind);
  assertSchema(schemaKind, value, relativePath);
  if (kind === "creation") {
    const creation = value as { id: string };
    if (relativePath !== `creations/${creation.id}/creation.json`) {
      throw new ArchiveError("ARCHIVE_CORRUPTION", "Creation record path does not match its ID.", {
        relativePath,
        id: creation.id,
      });
    }
  } else if (kind === "revision") {
    const revision = value as PromptRevisionRecord;
    if (
      relativePath !== `creations/${revision.creationId}/revisions/${revision.id}/revision.json`
    ) {
      throw new ArchiveError(
        "ARCHIVE_CORRUPTION",
        "Prompt Revision record path does not match its identity.",
        { relativePath, id: revision.id },
      );
    }
    revisions.set(revision.id, revision);
  } else if (kind === "generation") {
    const generation = value as GenerationRecord;
    if (
      relativePath !==
      `creations/${generation.creationId}/generations/${generation.id}/generation.json`
    ) {
      throw new ArchiveError(
        "ARCHIVE_CORRUPTION",
        "Generation record path does not match its identity.",
        { relativePath, id: generation.id },
      );
    }
    generations.set(generation.id, generation);
  }
}

function validateRelationships(
  root: string,
  markers: CommitMarker[],
  revisions: Map<string, PromptRevisionRecord>,
  generations: Map<string, GenerationRecord>,
  assets: Set<string>,
  diagnostics: ValidationDiagnostic[],
): void {
  const committedPaths = new Set(
    markers.flatMap((marker) => marker.records.map((record) => record.path)),
  );
  for (const revision of revisions.values()) {
    const creationPath = `creations/${revision.creationId}/creation.json`;
    if (!committedPaths.has(creationPath)) {
      diagnostics.push(
        crossReferenceDiagnostic(creationPath, "Prompt Revision Creation is not committed."),
      );
    }
    const promptPath = `creations/${revision.creationId}/revisions/${revision.id}/prompt.md`;
    if (!committedPaths.has(promptPath)) {
      diagnostics.push(
        crossReferenceDiagnostic(promptPath, "Prompt Revision has no committed prompt body."),
      );
    } else {
      const actual = sha256Bytes(readFileSync(resolveManagedPath(root, promptPath)));
      if (actual !== revision.promptSha256) {
        diagnostics.push(
          crossReferenceDiagnostic(
            promptPath,
            "Prompt body digest does not match revision metadata.",
          ),
        );
      }
    }
    if (revision.parentRevisionId) {
      const parent = revisions.get(revision.parentRevisionId);
      if (!parent || parent.creationId !== revision.creationId) {
        diagnostics.push(
          crossReferenceDiagnostic(
            `creations/${revision.creationId}/revisions/${revision.id}/revision.json`,
            "Prompt Revision parent is missing or belongs to another Creation.",
          ),
        );
      }
    }
  }

  for (const revision of revisions.values()) {
    const visited = new Set<string>();
    let cursor: PromptRevisionRecord | undefined = revision;
    while (cursor?.parentRevisionId) {
      if (visited.has(cursor.id)) {
        diagnostics.push(
          crossReferenceDiagnostic(
            `creations/${revision.creationId}/revisions/${revision.id}/revision.json`,
            "Prompt Revision graph contains a cycle.",
          ),
        );
        break;
      }
      visited.add(cursor.id);
      cursor = revisions.get(cursor.parentRevisionId);
    }
  }

  for (const generation of generations.values()) {
    const generationPath = `creations/${generation.creationId}/generations/${generation.id}/generation.json`;
    if (!committedPaths.has(`creations/${generation.creationId}/creation.json`)) {
      diagnostics.push(
        crossReferenceDiagnostic(generationPath, "Generation Creation is not committed."),
      );
    }
    const revision = revisions.get(generation.promptRevisionId);
    if (!revision || revision.creationId !== generation.creationId) {
      diagnostics.push(
        crossReferenceDiagnostic(
          generationPath,
          "Generation Prompt Revision is missing or belongs to another Creation.",
        ),
      );
    }
    if (generation.replayOfGenerationId && !generations.has(generation.replayOfGenerationId)) {
      diagnostics.push(
        crossReferenceDiagnostic(generationPath, "Replay source Generation is not committed."),
      );
    }
    for (const reference of generation.references) {
      if (!assets.has(reference.assetSha256)) {
        diagnostics.push(
          crossReferenceDiagnostic(
            generationPath,
            `Reference Image ${reference.assetSha256} is not committed.`,
          ),
        );
      }
    }
    for (const output of generation.outputs) {
      if (!assets.has(output.assetSha256)) {
        diagnostics.push(
          crossReferenceDiagnostic(
            generationPath,
            `Output Image ${output.assetSha256} is not committed.`,
          ),
        );
      }
    }
    const indices = generation.outputs.map((output) => output.index);
    if (
      new Set(indices).size !== indices.length ||
      indices.some((index, position) => index !== position)
    ) {
      diagnostics.push(
        crossReferenceDiagnostic(
          generationPath,
          "Generation Output indices must be unique and contiguous from zero.",
        ),
      );
    }
  }

  for (const generation of generations.values()) {
    const visited = new Set<string>();
    let cursor: GenerationRecord | undefined = generation;
    while (cursor?.replayOfGenerationId) {
      if (visited.has(cursor.id)) {
        diagnostics.push(
          crossReferenceDiagnostic(
            `creations/${generation.creationId}/generations/${generation.id}/generation.json`,
            "Replay graph contains a cycle.",
          ),
        );
        break;
      }
      visited.add(cursor.id);
      cursor = generations.get(cursor.replayOfGenerationId);
    }
  }
}

function scanManagedTrees(
  root: string,
  committedPaths: Map<string, string>,
  diagnostics: ValidationDiagnostic[],
): void {
  for (const base of [
    "archive",
    "assets",
    "creations",
    "curation",
    ".staging",
    ".quarantine",
    ".locks",
    ".cache",
  ]) {
    const basePath = join(root, ...base.split("/"));
    if (!pathExists(basePath)) {
      continue;
    }
    walk(basePath, (absolutePath, status) => {
      const relativePath = relative(root, absolutePath).split("\\").join("/");
      if (status.isSymbolicLink()) {
        diagnostics.push({
          code: "ARCHIVE_SYMLINK_FORBIDDEN",
          severity: "error",
          relativePath,
          message: "Managed tree contains a symbolic link.",
        });
        return false;
      }
      if (!status.isFile()) {
        return true;
      }
      const archiveManaged =
        relativePath.startsWith("assets/sha256/") ||
        /^creations\/[^/]+\/creation\.json$/.test(relativePath) ||
        /^creations\/[^/]+\/revisions\/[^/]+\/(?:prompt\.md|revision\.json)$/.test(relativePath) ||
        /^creations\/[^/]+\/generations\/[^/]+\/generation\.json$/.test(relativePath);
      if (archiveManaged && !committedPaths.has(relativePath)) {
        diagnostics.push({
          code: "ARCHIVE_UNCOMMITTED_OBJECT",
          severity: "error",
          relativePath,
          message: "Managed Archive object is not covered by a Commit Marker.",
        });
      }
      if (/^creations\/[^/]+\/prompt-draft\.json$/.test(relativePath)) {
        validateMutableJson(root, relativePath, "draft", diagnostics);
      } else if (/^curation\/creations\/[^/]+\.json$/.test(relativePath)) {
        validateMutableJson(root, relativePath, "creationCuration", diagnostics);
      } else if (/^curation\/images\/[a-f0-9]{64}\.json$/.test(relativePath)) {
        validateMutableJson(root, relativePath, "imageCuration", diagnostics);
      }
      return true;
    });
  }
}

function validateMutableJson(
  root: string,
  relativePath: string,
  kind: "draft" | "creationCuration" | "imageCuration",
  diagnostics: ValidationDiagnostic[],
): void {
  try {
    const value = readJson(resolveManagedPath(root, relativePath));
    assertSchema(kind, value, relativePath);
  } catch (error) {
    diagnostics.push(toDiagnostic(error, relativePath));
  }
}

function walk(
  path: string,
  visit: (path: string, status: NonNullable<ReturnType<typeof lstatSync>>) => boolean,
): void {
  const status = lstatSync(path) as NonNullable<ReturnType<typeof lstatSync>>;
  if (!visit(path, status) || !status.isDirectory() || status.isSymbolicLink()) {
    return;
  }
  for (const name of readdirSync(path)) {
    walk(join(path, name), visit);
  }
}

function schemaKindForRecord(kind: CommitMarker["records"][number]["kind"]): SchemaKind {
  if (kind === "creation") return "creation";
  if (kind === "revision") return "revision";
  if (kind === "generation") return "generation";
  throw new Error(`Record kind ${kind} has no JSON schema.`);
}

function assertSchema(kind: SchemaKind, value: unknown, relativePath: string): void {
  try {
    schemaRegistry.assert(kind, value);
  } catch (error) {
    if (error instanceof RecordSchemaError) {
      throw new ArchiveError(
        "ARCHIVE_SCHEMA_INVALID",
        `Record does not match the ${kind} schema.`,
        { relativePath, issues: error.issues },
      );
    }
    throw error;
  }
}

function crossReferenceDiagnostic(relativePath: string, message: string): ValidationDiagnostic {
  return {
    code: "ARCHIVE_CORRUPTION",
    severity: "error",
    relativePath,
    message,
  };
}

function toDiagnostic(error: unknown, fallbackPath: string): ValidationDiagnostic {
  if (error instanceof ArchiveError) {
    return {
      code: error.code,
      severity: "error",
      relativePath:
        typeof error.details.relativePath === "string" ? error.details.relativePath : fallbackPath,
      message: error.message,
    };
  }
  return {
    code: "ARCHIVE_CORRUPTION",
    severity: "error",
    relativePath: fallbackPath,
    message: error instanceof Error ? error.message : String(error),
  };
}
