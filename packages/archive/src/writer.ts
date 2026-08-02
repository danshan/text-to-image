import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  ArchiveError,
  LIBRARY_FORMAT_VERSION,
  type CreationCuration,
  type CreationRecord,
  type ImageCuration,
  type LibraryManifest,
  type PromptDraftMetadata,
  type PromptRevisionRecord,
} from "@text-to-image/domain";
import { inspectImage } from "./image.js";
import {
  defaultRuntimeAdapters,
  isDirectoryEmpty,
  pathExists,
  readJson,
  resolveManagedPath,
  sha256Bytes,
  syncDirectory,
  type RuntimeAdapters,
  writeJsonAtomic,
  writeTextAtomic,
} from "./internal.js";
import {
  commitTransaction,
  createTransaction,
  stageRecordBytes,
  stageRecordJson,
  transitionTransaction,
  type TransactionOptions,
} from "./transaction.js";
import {
  assertLibraryValid,
  assertRecordSchema,
  readCommittedPathIndex,
  validateLibrary,
} from "./validator.js";

const BASE_DIRECTORIES = [
  "inbox",
  "archive/commits",
  "assets/sha256",
  "creations",
  "curation/creations",
  "curation/images",
  ".staging",
  ".quarantine",
  ".locks",
  ".cache/thumbnails",
] as const;

export interface InitLibraryResult {
  libraryRoot: string;
  manifest: LibraryManifest;
}

export interface CreateCreationInput {
  id?: string;
  title?: string;
  prompt?: string;
}

export interface CreateCreationResult {
  creation: CreationRecord;
  curation: CreationCuration;
  transactionId: string;
}

export interface DraftSnapshot {
  content: string;
  contentSha256: string;
  metadata: PromptDraftMetadata;
}

export interface ImportAssetResult {
  assetSha256: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  relativePath: string;
  transactionId: string | null;
  reused: boolean;
}

export function initLibrary(
  libraryRoot: string,
  adapters: RuntimeAdapters = defaultRuntimeAdapters,
): InitLibraryResult {
  const target = libraryRoot;
  if (existsSync(target) && !isDirectoryEmpty(target)) {
    throw new ArchiveError("LIBRARY_ALREADY_EXISTS", "Library target exists and is not empty.", {
      libraryRoot: target,
    });
  }
  mkdirSync(dirname(target), { recursive: true });
  const temporaryRoot = join(dirname(target), `.${basename(target)}.init-${adapters.uuid()}`);
  if (existsSync(temporaryRoot)) {
    throw new ArchiveError("ARCHIVE_CONFLICT", "Temporary initialization path already exists.");
  }
  mkdirSync(temporaryRoot);
  for (const relativePath of BASE_DIRECTORIES) {
    mkdirSync(join(temporaryRoot, ...relativePath.split("/")), { recursive: true });
  }
  const manifest: LibraryManifest = {
    schemaVersion: 1,
    formatVersion: LIBRARY_FORMAT_VERSION,
    libraryId: adapters.uuid(),
    createdAt: adapters.now(),
    hashAlgorithm: "sha256",
  };
  assertRecordSchema("library", manifest, "library.json");
  writeJsonAtomic(join(temporaryRoot, "library.json"), manifest);
  syncDirectory(temporaryRoot);
  if (existsSync(target)) {
    rmdirSync(target);
  }
  renameSync(temporaryRoot, target);
  syncDirectory(dirname(target));
  const canonicalRoot = realpathSync(target);
  assertLibraryValid(canonicalRoot, "full");
  return { libraryRoot: canonicalRoot, manifest };
}

export function createCreation(
  libraryRoot: string,
  input: CreateCreationInput = {},
  options: TransactionOptions = {},
): CreateCreationResult {
  assertLibraryValid(libraryRoot, "quick");
  const adapters = options.adapters ?? defaultRuntimeAdapters;
  const id = input.id ?? adapters.uuid();
  const record: CreationRecord = {
    schemaVersion: 1,
    id,
    createdAt: adapters.now(),
  };
  const transaction = createTransaction(
    libraryRoot,
    { operation: "initialize_creation", creationId: id },
    options,
  );
  const creationPath = `creations/${id}/creation.json`;
  stageRecordJson(libraryRoot, transaction.id, "creation", creationPath, record, options);
  transitionTransaction(libraryRoot, transaction.id, "ready_to_commit", {}, options);
  commitTransaction(libraryRoot, transaction.id, options);

  const prompt = input.prompt ?? "";
  const draftMetadata: PromptDraftMetadata = {
    schemaVersion: 1,
    basedOnRevisionId: null,
    observedContentSha256: sha256Bytes(prompt),
    updatedAt: adapters.now(),
  };
  writeTextAtomic(resolveManagedPath(libraryRoot, `creations/${id}/prompt-draft.md`), prompt);
  writeJsonAtomic(
    resolveManagedPath(libraryRoot, `creations/${id}/prompt-draft.json`),
    draftMetadata,
  );

  const curation: CreationCuration = {
    schemaVersion: 1,
    entityRevision: 1,
    creationId: id,
    title: input.title ?? "Untitled Creation",
    status: "active",
    tags: [],
    favorite: false,
    note: "",
    updatedAt: adapters.now(),
  };
  assertRecordSchema("creationCuration", curation, `curation/creations/${id}.json`);
  writeJsonAtomic(resolveManagedPath(libraryRoot, `curation/creations/${id}.json`), curation);
  return { creation: record, curation, transactionId: transaction.id };
}

export function readDraft(libraryRoot: string, creationId: string): DraftSnapshot {
  assertCreationCommitted(libraryRoot, creationId);
  const contentPath = resolveManagedPath(libraryRoot, `creations/${creationId}/prompt-draft.md`);
  const metadataPath = resolveManagedPath(libraryRoot, `creations/${creationId}/prompt-draft.json`);
  if (!pathExists(contentPath) || !pathExists(metadataPath)) {
    throw new ArchiveError("ARCHIVE_CORRUPTION", "Creation is missing Prompt Draft files.", {
      creationId,
    });
  }
  const content = readFileSync(contentPath, "utf8");
  const metadata = readJson(metadataPath);
  assertRecordSchema("draft", metadata, `creations/${creationId}/prompt-draft.json`);
  return {
    content,
    contentSha256: sha256Bytes(content),
    metadata: metadata as PromptDraftMetadata,
  };
}

export function updateDraft(
  libraryRoot: string,
  creationId: string,
  content: string,
  expectedContentSha256: string,
  basedOnRevisionId?: string | null,
  adapters: RuntimeAdapters = defaultRuntimeAdapters,
): DraftSnapshot {
  const current = readDraft(libraryRoot, creationId);
  if (current.contentSha256 !== expectedContentSha256) {
    throw new ArchiveError(
      "DRAFT_CONFLICT",
      "Prompt Draft changed since it was loaded.",
      {
        creationId,
        expectedContentSha256,
        actualContentSha256: current.contentSha256,
      },
      "Reload the Draft and reapply the edit.",
    );
  }
  if (basedOnRevisionId) {
    assertRevisionCommitted(libraryRoot, creationId, basedOnRevisionId);
  }
  const contentPath = resolveManagedPath(libraryRoot, `creations/${creationId}/prompt-draft.md`);
  const metadataPath = resolveManagedPath(libraryRoot, `creations/${creationId}/prompt-draft.json`);
  writeTextAtomic(contentPath, content);
  const metadata: PromptDraftMetadata = {
    schemaVersion: 1,
    basedOnRevisionId:
      basedOnRevisionId === undefined ? current.metadata.basedOnRevisionId : basedOnRevisionId,
    observedContentSha256: sha256Bytes(content),
    updatedAt: adapters.now(),
  };
  assertRecordSchema("draft", metadata, `creations/${creationId}/prompt-draft.json`);
  writeJsonAtomic(metadataPath, metadata);
  return { content, contentSha256: metadata.observedContentSha256, metadata };
}

export function checkpointRevision(
  libraryRoot: string,
  creationId: string,
  input: {
    prompt: string;
    changeInstruction?: string;
    parentRevisionId?: string | null;
    revisionId?: string;
  },
  options: TransactionOptions = {},
): { revision: PromptRevisionRecord; transactionId: string } {
  assertCreationCommitted(libraryRoot, creationId);
  const adapters = options.adapters ?? defaultRuntimeAdapters;
  if (input.parentRevisionId) {
    assertRevisionCommitted(libraryRoot, creationId, input.parentRevisionId);
  }
  const revisionId = input.revisionId ?? adapters.uuid();
  const revision: PromptRevisionRecord = {
    schemaVersion: 1,
    id: revisionId,
    creationId,
    parentRevisionId: input.parentRevisionId ?? null,
    changeInstruction: input.changeInstruction ?? "",
    promptSha256: sha256Bytes(input.prompt),
    createdAt: adapters.now(),
  };
  const transaction = createTransaction(
    libraryRoot,
    {
      operation: "checkpoint_revision",
      creationId,
      revisionId,
    },
    options,
  );
  const base = `creations/${creationId}/revisions/${revisionId}`;
  stageRecordBytes(
    libraryRoot,
    transaction.id,
    "prompt",
    `${base}/prompt.md`,
    Buffer.from(input.prompt, "utf8"),
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
  transitionTransaction(libraryRoot, transaction.id, "ready_to_commit", {}, options);
  commitTransaction(libraryRoot, transaction.id, options);
  return { revision, transactionId: transaction.id };
}

export function importImageAsset(
  libraryRoot: string,
  sourcePath: string,
  options: TransactionOptions = {},
): ImportAssetResult {
  assertLibraryValid(libraryRoot, "quick");
  const sourceBytes = readFileSync(sourcePath);
  const inspection = inspectImage(sourceBytes, sourcePath);
  const assetSha256 = sha256Bytes(sourceBytes);
  const relativePath = `assets/sha256/${assetSha256.slice(0, 2)}/${assetSha256}.${inspection.extension}`;
  const owners = readCommittedPathIndex(libraryRoot);
  const owner = owners.get(relativePath);
  if (owner) {
    const finalBytes = readFileSync(resolveManagedPath(libraryRoot, relativePath));
    if (sha256Bytes(finalBytes) !== assetSha256) {
      throw new ArchiveError(
        "ARCHIVE_HASH_MISMATCH",
        "Existing Image Asset does not match its content identity.",
        { relativePath },
      );
    }
    return {
      assetSha256,
      ...inspection,
      relativePath,
      transactionId: null,
      reused: true,
    };
  }

  const transaction = createTransaction(libraryRoot, { operation: "import_asset" }, options);
  stageRecordBytes(libraryRoot, transaction.id, "image_asset", relativePath, sourceBytes, options);
  transitionTransaction(libraryRoot, transaction.id, "ready_to_commit", {}, options);
  const marker = commitTransaction(libraryRoot, transaction.id, options);
  return {
    assetSha256,
    ...inspection,
    relativePath,
    transactionId: marker.id === transaction.id ? transaction.id : null,
    reused: marker.id !== transaction.id,
  };
}

export function updateCreationCuration(
  libraryRoot: string,
  creationId: string,
  expectedEntityRevision: number,
  patch: Partial<Pick<CreationCuration, "title" | "status" | "tags" | "favorite" | "note">>,
  adapters: RuntimeAdapters = defaultRuntimeAdapters,
): CreationCuration {
  assertCreationCommitted(libraryRoot, creationId);
  const path = resolveManagedPath(libraryRoot, `curation/creations/${creationId}.json`);
  const current = readJson(path) as CreationCuration;
  assertRecordSchema("creationCuration", current, `curation/creations/${creationId}.json`);
  if (current.entityRevision !== expectedEntityRevision) {
    throw new ArchiveError("CURATION_CONFLICT", "Creation Curation changed since it was loaded.", {
      expectedEntityRevision,
      actualEntityRevision: current.entityRevision,
    });
  }
  const next: CreationCuration = {
    ...current,
    ...patch,
    tags: patch.tags ? normalizeTags(patch.tags) : current.tags,
    entityRevision: current.entityRevision + 1,
    updatedAt: adapters.now(),
  };
  assertRecordSchema("creationCuration", next, `curation/creations/${creationId}.json`);
  writeJsonAtomic(path, next);
  return next;
}

export function updateImageCuration(
  libraryRoot: string,
  assetSha256: string,
  expectedEntityRevision: number,
  patch: Partial<Pick<ImageCuration, "tags" | "favorite" | "rating" | "hidden" | "note">>,
  adapters: RuntimeAdapters = defaultRuntimeAdapters,
): ImageCuration {
  assertAssetCommitted(libraryRoot, assetSha256);
  const path = resolveManagedPath(libraryRoot, `curation/images/${assetSha256}.json`);
  let current: ImageCuration;
  if (pathExists(path)) {
    current = readJson(path) as ImageCuration;
    assertRecordSchema("imageCuration", current, `curation/images/${assetSha256}.json`);
  } else {
    current = {
      schemaVersion: 1,
      entityRevision: 0,
      assetSha256,
      tags: [],
      favorite: false,
      rating: null,
      hidden: false,
      note: "",
      updatedAt: adapters.now(),
    };
  }
  if (current.entityRevision !== expectedEntityRevision) {
    throw new ArchiveError("CURATION_CONFLICT", "Image Curation changed since it was loaded.", {
      expectedEntityRevision,
      actualEntityRevision: current.entityRevision,
    });
  }
  const next: ImageCuration = {
    ...current,
    ...patch,
    tags: patch.tags ? normalizeTags(patch.tags) : current.tags,
    entityRevision: current.entityRevision + 1,
    updatedAt: adapters.now(),
  };
  assertRecordSchema("imageCuration", next, `curation/images/${assetSha256}.json`);
  writeJsonAtomic(path, next);
  return next;
}

export function validateFixtureLibrary(libraryRoot: string): ReturnType<typeof validateLibrary> {
  return validateLibrary(libraryRoot, "full");
}

export function assertCreationCommitted(libraryRoot: string, creationId: string): void {
  const relativePath = `creations/${creationId}/creation.json`;
  if (!readCommittedPathIndex(libraryRoot).has(relativePath)) {
    throw new ArchiveError("ARCHIVE_CORRUPTION", "Creation is not committed.", {
      creationId,
      relativePath,
    });
  }
}

export function assertRevisionCommitted(
  libraryRoot: string,
  creationId: string,
  revisionId: string,
): void {
  const relativePath = `creations/${creationId}/revisions/${revisionId}/revision.json`;
  if (!readCommittedPathIndex(libraryRoot).has(relativePath)) {
    throw new ArchiveError(
      "ARCHIVE_CORRUPTION",
      "Prompt Revision is not committed for this Creation.",
      { creationId, revisionId, relativePath },
    );
  }
}

export function findAssetRelativePath(libraryRoot: string, assetSha256: string): string {
  const prefix = `assets/sha256/${assetSha256.slice(0, 2)}/${assetSha256}.`;
  const matches = [...readCommittedPathIndex(libraryRoot).keys()].filter((path) =>
    path.startsWith(prefix),
  );
  if (matches.length !== 1) {
    throw new ArchiveError(
      "ARCHIVE_CORRUPTION",
      "Image Asset identity does not resolve to exactly one committed payload.",
      { assetSha256, matches },
    );
  }
  return matches[0]!;
}

function assertAssetCommitted(libraryRoot: string, assetSha256: string): void {
  findAssetRelativePath(libraryRoot, assetSha256);
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort();
}
