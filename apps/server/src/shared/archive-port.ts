import type { CurationPatchRequest, RecoveryItem } from "@text-to-image/api-contract";

export interface ArchivePort {
  readonly libraryRoot: string;
  readonly formatVersion: number | null;
  readonly readOnly: boolean;
  diagnostics(): Promise<string[]>;
  createCreation(input: { title: string; prompt: string }): Promise<{ id: string }>;
  updateCreationCuration(
    id: string,
    request: CurationPatchRequest,
  ): Promise<Record<string, unknown>>;
  updateImageCuration(
    sha256: string,
    request: CurationPatchRequest,
  ): Promise<Record<string, unknown>>;
  updateDraft(
    creationId: string,
    input: { expectedContentSha256: string; content: string; basedOnRevisionId: string | null },
  ): Promise<Record<string, unknown>>;
  importImage(sourcePath: string): Promise<{ sha256: string }>;
  listRecovery(): Promise<{
    items: RecoveryItem[];
    quarantineCount: number;
    lock: { present: boolean; owner: string | null };
  }>;
  recover(transactionId: string, action: string, dryRun: boolean): Promise<Record<string, unknown>>;
}
