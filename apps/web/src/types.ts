import type { BootstrapResponse } from "@text-to-image/api-contract";

export type {
  ApiProblem,
  BootstrapResponse,
  CreationDetail,
  CreationSummary,
  CurationConflict,
  CurationPatchRequest,
  DraftPutRequest,
  GalleryResponse,
  GenerationError,
  GenerationIssue,
  GenerationIssuesResponse,
  GenerationView,
  HealthResponse,
  ImageDetail,
  ImageSummary,
  LibraryHealth,
  LibraryState,
  LibraryTransition,
  LibraryTransitionAction,
  LibraryTransitionCommitResponse,
  LibraryTransitionRequest,
  LibraryTransitionStage,
  LibraryUnavailable,
  LibraryUnavailableReason,
  MutationResponse,
  PageInfo,
  PromptRevisionView,
  RecoveryItem,
  RecoveryResponse,
  ReferenceRelation,
} from "@text-to-image/api-contract";

export type GenerationStatus = "succeeded" | "failed" | "interrupted";
export type CreationStatus = "active" | "shelved";
export type ReferenceRole = "subject" | "style" | "composition" | "palette" | "other";
export type RecoveryAction =
  "cancel" | "finalize_interrupted" | "continue" | "commit" | "quarantine";

export interface WebBootstrap extends BootstrapResponse {
  libraryName?: string;
}
