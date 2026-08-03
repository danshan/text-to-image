export const API_VERSION = "v1" as const;

export type LibraryHealth =
  "healthy" | "indexing" | "degraded" | "recovery_required" | "read_only" | "unavailable";

export interface ApiProblem {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  recoveryHint?: string;
  correlationId: string;
}

export type LibraryUnavailableReason = "missing_root" | "missing_manifest" | "permission_denied";

export interface LibraryReady {
  status: "ready";
  libraryRoot: string;
}

export interface LibraryUnavailable {
  status: "unavailable";
  libraryRoot: string;
  reason: LibraryUnavailableReason;
  allowedActions: Array<"initialize" | "select" | "retry">;
}

export type LibraryState = LibraryReady | LibraryUnavailable;

export interface BootstrapResponse {
  apiVersion: typeof API_VERSION;
  libraryFormatVersion: number | null;
  sessionToken: string;
  library: LibraryState;
  capabilities: {
    curation: boolean;
    recovery: boolean;
    libraryManagement: true;
    generationFromWeb: false;
  };
}

export type LibraryTransitionAction = "initialize" | "select" | "retry";
export type LibraryTransitionStage = "preparing" | "ready" | "switching" | "succeeded" | "failed";

export interface LibraryTransition {
  id: string;
  action: LibraryTransitionAction;
  libraryRoot: string;
  stage: LibraryTransitionStage;
  processed: number;
  total: number | null;
  error: string | null;
}

export interface LibraryTransitionRequest {
  action: LibraryTransitionAction;
  libraryRoot?: string;
}

export interface LibraryTransitionCommitResponse {
  transition: LibraryTransition;
  bootstrap: BootstrapResponse;
}

export interface HealthResponse {
  status: LibraryHealth;
  apiVersion: typeof API_VERSION;
  libraryFormatVersion: number | null;
  index: {
    available: boolean;
    latestArchiveMarker: string | null;
    lastIndexedMarker: string | null;
    lagCount: number;
  };
  recoveryCount: number;
  diagnostics: string[];
}

export interface PageInfo {
  nextCursor: string | null;
  total: number;
}

export interface ImageSummary {
  sha256: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  width: number | null;
  height: number | null;
  createdAt: string;
  creationId: string | null;
  creationTitle: string;
  generationId: string | null;
  generationStatus: "succeeded" | "failed" | "interrupted" | null;
  tags: string[];
  favorite: boolean;
  rating: number | null;
  hidden: boolean;
  note: string;
  entityRevision: number;
  imported: boolean;
}

export interface GalleryResponse {
  items: ImageSummary[];
  page: PageInfo;
}

export interface CreationSummary {
  id: string;
  createdAt: string;
  title: string;
  status: "active" | "shelved";
  tags: string[];
  favorite: boolean;
  note: string;
  entityRevision: number;
  generationCount: number;
  imageCount: number;
}

export interface ReferenceRelation {
  generationId: string;
  creationId: string;
  roles: Array<"subject" | "style" | "composition" | "palette" | "other">;
  guidance: string | null;
}

export interface PromptRevisionView {
  id: string;
  creationId: string;
  parentRevisionId: string | null;
  changeInstruction: string;
  prompt: string;
  promptSha256: string;
  createdAt: string;
}

export interface GenerationModeration {
  stage: "input" | "output" | "unknown";
  categories: string[];
}

export interface GenerationError {
  code: string;
  summary: string;
  retryable: boolean;
  moderation?: GenerationModeration;
}

export interface GenerationView {
  id: string;
  creationId: string;
  promptRevisionId: string;
  replayOfGenerationId: string | null;
  status: "succeeded" | "failed" | "interrupted";
  outcomeKnown: boolean;
  references: Array<{
    assetSha256: string;
    roles: ReferenceRelation["roles"];
    guidance: string | null;
  }>;
  outputs: Array<{
    index: number;
    assetSha256: string;
    mediaType: ImageSummary["mediaType"];
    width: number;
    height: number;
  }>;
  tool: {
    name: string;
    model: string | null;
    parameters: Record<string, unknown>;
  };
  startedAt: string;
  completedAt: string;
  error: GenerationError | null;
  prompt?: PromptRevisionView;
}

export interface GenerationIssue {
  generationId: string;
  creationId: string;
  creationTitle: string;
  status: "failed" | "interrupted";
  outcomeKnown: boolean;
  completedAt: string;
  error: GenerationError | null;
}

export interface GenerationIssuesResponse {
  items: GenerationIssue[];
  page: PageInfo;
}

export interface CreationDetail extends CreationSummary {
  draft: {
    content: string;
    contentSha256: string;
    basedOnRevisionId: string | null;
    updatedAt: string | null;
    externalEdit: boolean;
  };
  revisions: PromptRevisionView[];
  generations: GenerationView[];
}

export interface ImageDetail extends ImageSummary {
  producingGeneration: GenerationView | null;
  usedAsReference: ReferenceRelation[];
}

export interface RecoveryItem {
  transactionId: string;
  state: "prepared" | "invocation_started" | "outputs_captured" | "ready_to_commit" | "malformed";
  creationId: string | null;
  generationId: string | null;
  ageSeconds: number;
  validation: string[];
  recommendedAction: "cancel" | "finalize_interrupted" | "continue" | "commit" | "quarantine";
  availableActions: string[];
}

export interface RecoveryResponse {
  items: RecoveryItem[];
  quarantineCount: number;
  lock: { present: boolean; owner: string | null };
}

export interface CurationPatchRequest {
  expectedRevision: number;
  patch: {
    title?: string;
    status?: "active" | "shelved";
    tags?: string[];
    favorite?: boolean;
    note?: string;
    rating?: number | null;
    hidden?: boolean;
  };
}

export interface DraftPutRequest {
  expectedContentSha256: string;
  content: string;
  basedOnRevisionId: string | null;
}

export interface MutationResponse<T> {
  data: T;
}

export interface CurationConflict<T> extends ApiProblem {
  code: "CURATION_CONFLICT" | "DRAFT_CONFLICT";
  current: T;
}
