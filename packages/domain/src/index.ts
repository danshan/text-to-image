export const LIBRARY_FORMAT_VERSION = 1 as const;
export const SCHEMA_VERSION = 1 as const;

export const REFERENCE_ROLES = ["subject", "style", "composition", "palette", "other"] as const;

export type ReferenceRole = (typeof REFERENCE_ROLES)[number];
export type GenerationStatus = "succeeded" | "failed" | "interrupted";
export type TransactionState =
  "prepared" | "invocation_started" | "outputs_captured" | "ready_to_commit";
export type CommitOperation =
  "initialize_creation" | "checkpoint_revision" | "import_asset" | "generation" | "merge_library";
export type CommitRecordKind = "creation" | "prompt" | "revision" | "generation" | "image_asset";

export interface LibraryManifest {
  schemaVersion: 1;
  formatVersion: 1;
  libraryId: string;
  createdAt: string;
  hashAlgorithm: "sha256";
}

export interface CreationRecord {
  schemaVersion: 1;
  id: string;
  createdAt: string;
}

export interface PromptDraftMetadata {
  schemaVersion: 1;
  basedOnRevisionId: string | null;
  observedContentSha256: string;
  updatedAt: string;
}

export interface PromptRevisionRecord {
  schemaVersion: 1;
  id: string;
  creationId: string;
  parentRevisionId: string | null;
  changeInstruction: string;
  promptSha256: string;
  createdAt: string;
}

export interface ReferenceImage {
  assetSha256: string;
  roles: ReferenceRole[];
  guidance?: string;
}

export interface GenerationOutput {
  index: number;
  assetSha256: string;
  mediaType: SupportedMediaType;
  width: number;
  height: number;
}

export type GenerationModerationStage = "input" | "output" | "unknown";

export interface GenerationModerationRecord {
  stage: GenerationModerationStage;
  categories: string[];
}

export interface GenerationErrorRecord {
  code: string;
  summary: string;
  retryable: boolean;
  moderation?: GenerationModerationRecord;
}

export interface GenerationRecord {
  schemaVersion: 1;
  id: string;
  creationId: string;
  promptRevisionId: string;
  replayOfGenerationId: string | null;
  status: GenerationStatus;
  outcomeKnown: boolean;
  references: ReferenceImage[];
  outputs: GenerationOutput[];
  tool: {
    name: string;
    model: string | null;
    parameters: Record<string, unknown>;
  };
  startedAt: string;
  completedAt: string;
  error: GenerationErrorRecord | null;
}

export interface CommitRecord {
  kind: CommitRecordKind;
  path: string;
  sha256: string;
}

export interface CommitMarker {
  schemaVersion: 1;
  id: string;
  operation: CommitOperation;
  createdAt: string;
  records: CommitRecord[];
}

export interface CreationCuration {
  schemaVersion: 1;
  entityRevision: number;
  creationId: string;
  title: string;
  status: "active" | "shelved";
  tags: string[];
  favorite: boolean;
  note: string;
  updatedAt: string;
}

export interface ImageCuration {
  schemaVersion: 1;
  entityRevision: number;
  assetSha256: string;
  tags: string[];
  favorite: boolean;
  rating: number | null;
  hidden: boolean;
  note: string;
  updatedAt: string;
}

export interface StagedRecord {
  kind: CommitRecordKind;
  path: string;
  sha256: string;
}

export interface TransactionRecord {
  schemaVersion: 1;
  id: string;
  operation: CommitOperation;
  state: TransactionState;
  creationId: string | null;
  revisionId: string | null;
  generationId: string | null;
  draftContentSha256: string | null;
  createdAt: string;
  updatedAt: string;
  stagedRecords: StagedRecord[];
  request: Record<string, unknown>;
}

export type SupportedMediaType = "image/png" | "image/jpeg" | "image/webp";

export interface ImageInspection {
  mediaType: SupportedMediaType;
  extension: "png" | "jpg" | "webp";
  width: number;
  height: number;
}

export function assertGenerationError(error: GenerationErrorRecord): void {
  if (!error.code.trim() || error.code.length > 100) {
    throw new ArchiveError(
      "ARCHIVE_SCHEMA_INVALID",
      "Generation error code must be between 1 and 100 characters.",
    );
  }
  if (!error.summary.trim() || error.summary.length > 1000) {
    throw new ArchiveError(
      "ARCHIVE_SCHEMA_INVALID",
      "Generation error summary must be between 1 and 1000 characters.",
    );
  }
  if (!error.moderation) return;
  if (!(["input", "output", "unknown"] as const).includes(error.moderation.stage)) {
    throw new ArchiveError("ARCHIVE_SCHEMA_INVALID", "Generation moderation stage is invalid.");
  }
  if (
    error.moderation.categories.length > 20 ||
    error.moderation.categories.some((category) => !category.trim() || category.length > 100) ||
    new Set(error.moderation.categories).size !== error.moderation.categories.length
  ) {
    throw new ArchiveError(
      "ARCHIVE_SCHEMA_INVALID",
      "Generation moderation categories must be unique, non-empty, and bounded.",
    );
  }
}

export type ArchiveErrorCode =
  | "ARCHIVE_CONFLICT"
  | "ARCHIVE_CORRUPTION"
  | "ARCHIVE_HASH_MISMATCH"
  | "ARCHIVE_LOCKED"
  | "ARCHIVE_NOT_INITIALIZED"
  | "ARCHIVE_PATH_ESCAPE"
  | "ARCHIVE_SCHEMA_INVALID"
  | "ARCHIVE_SYMLINK_FORBIDDEN"
  | "ARCHIVE_UNSUPPORTED_FORMAT"
  | "CURATION_CONFLICT"
  | "DRAFT_CONFLICT"
  | "IMAGE_INVALID"
  | "IMAGE_SOURCE_MISSING"
  | "IMAGE_SOURCE_UNREADABLE"
  | "IMAGE_UNSUPPORTED"
  | "LIBRARY_ALREADY_EXISTS"
  | "LIBRARY_CONFIG_INVALID"
  | "LIBRARY_NOT_FOUND"
  | "RECOVERY_NOT_ALLOWED"
  | "TRANSACTION_INVALID_STATE"
  | "TRANSACTION_NOT_FOUND";

export class ArchiveError extends Error {
  readonly code: ArchiveErrorCode;
  readonly details: Record<string, unknown>;
  readonly recoveryHint: string | undefined;

  constructor(
    code: ArchiveErrorCode,
    message: string,
    details: Record<string, unknown> = {},
    recoveryHint?: string,
  ) {
    super(message);
    this.name = "ArchiveError";
    this.code = code;
    this.details = details;
    this.recoveryHint = recoveryHint;
  }
}

export interface ValidationDiagnostic {
  code: ArchiveErrorCode | "ARCHIVE_UNCOMMITTED_OBJECT" | "ARCHIVE_WARNING";
  severity: "error" | "warning";
  relativePath: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  mode: "quick" | "full";
  manifest: LibraryManifest | null;
  committedRecordCount: number;
  commitCount: number;
  diagnostics: ValidationDiagnostic[];
}

export function assertReferenceImages(references: readonly ReferenceImage[]): void {
  for (const reference of references) {
    const roles = new Set(reference.roles);
    if (roles.size === 0 || roles.size !== reference.roles.length) {
      throw new ArchiveError(
        "ARCHIVE_SCHEMA_INVALID",
        "Reference roles must be non-empty and unique.",
      );
    }
    for (const role of roles) {
      if (!REFERENCE_ROLES.includes(role)) {
        throw new ArchiveError("ARCHIVE_SCHEMA_INVALID", "Reference role is not supported.", {
          role,
        });
      }
    }
    if (roles.size === 1 && roles.has("other") && !reference.guidance?.trim()) {
      throw new ArchiveError(
        "ARCHIVE_SCHEMA_INVALID",
        "Guidance is required when other is the only reference role.",
      );
    }
  }
}

export function assertTransactionTransition(
  current: TransactionState,
  next: TransactionState,
): void {
  const allowed: Record<TransactionState, TransactionState[]> = {
    prepared: ["invocation_started"],
    invocation_started: ["outputs_captured", "ready_to_commit"],
    outputs_captured: ["outputs_captured", "ready_to_commit"],
    ready_to_commit: [],
  };
  if (!allowed[current].includes(next)) {
    throw new ArchiveError(
      "TRANSACTION_INVALID_STATE",
      `Cannot transition transaction from ${current} to ${next}.`,
      { current, next },
    );
  }
}

export function isLowercaseSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
