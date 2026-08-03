export interface IndexProgress {
  processed: number;
  total: number;
  markerId: string | null;
}

export interface GalleryQuery {
  q?: string;
  creationId?: string;
  status?: "active" | "shelved";
  favorite?: boolean;
  hidden?: "include" | "only" | "exclude";
  source?: "output" | "imported" | "all";
  generationStatus?: "succeeded" | "failed" | "interrupted";
  sort?: "newest" | "oldest" | "rating_desc";
  tags?: string[];
  rating?: number;
  role?: "subject" | "style" | "composition" | "palette" | "other";
  tool?: string;
  model?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface IndexedImage {
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
  extension: "png" | "jpg" | "webp";
}

export interface IndexedCreation {
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

export interface IndexedRevision {
  id: string;
  creationId: string;
  parentRevisionId: string | null;
  changeInstruction: string;
  prompt: string;
  promptSha256: string;
  createdAt: string;
}

export interface GenerationModerationRecord {
  stage: "input" | "output" | "unknown";
  categories: string[];
}

export interface GenerationErrorRecord {
  code: string;
  summary: string;
  retryable: boolean;
  moderation?: GenerationModerationRecord;
}

export interface IndexedGeneration {
  id: string;
  creationId: string;
  promptRevisionId: string;
  replayOfGenerationId: string | null;
  status: "succeeded" | "failed" | "interrupted";
  outcomeKnown: boolean;
  references: Array<{
    assetSha256: string;
    roles: Array<"subject" | "style" | "composition" | "palette" | "other">;
    guidance: string | null;
  }>;
  outputs: Array<{
    index: number;
    assetSha256: string;
    mediaType: "image/png" | "image/jpeg" | "image/webp";
    width: number;
    height: number;
  }>;
  tool: { name: string; model: string | null; parameters: Record<string, unknown> };
  startedAt: string;
  completedAt: string;
  error: GenerationErrorRecord | null;
}

export interface IndexedGenerationIssue {
  generationId: string;
  creationId: string;
  creationTitle: string;
  status: "failed" | "interrupted";
  outcomeKnown: boolean;
  completedAt: string;
  error: GenerationErrorRecord | null;
}

export interface IndexStatus {
  available: boolean;
  latestArchiveMarker: string | null;
  lastIndexedMarker: string | null;
  lagCount: number;
}
