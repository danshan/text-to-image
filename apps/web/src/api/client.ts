import type {
  ApiProblem,
  BootstrapResponse,
  CreationDetail,
  CreationSummary,
  CurationPatchRequest,
  DraftPutRequest,
  GalleryResponse,
  GenerationView,
  GenerationIssuesResponse,
  HealthResponse,
  ImageDetail,
  ImageSummary,
  LibraryTransition,
  LibraryTransitionAction,
  LibraryTransitionCommitResponse,
  MutationResponse,
  PurgePlan,
  RecoveryAction,
  RecoveryResponse,
} from "../types";
export type { GenerationIssue } from "../types";

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiProblem;

  constructor(status: number, body: ApiProblem) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export class ApiClient {
  private readonly fetcher: typeof fetch;

  constructor(
    private readonly bootstrap: BootstrapResponse,
    fetcher: typeof fetch = globalThis.fetch,
  ) {
    this.fetcher = fetcher.bind(globalThis);
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    options: RequestOptions = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    headers.set("X-Session-Token", this.bootstrap.sessionToken);

    const response = await this.fetcher(path, {
      ...init,
      credentials: "same-origin",
      headers,
      signal: options.signal,
    });

    if (!response.ok) {
      let body: ApiProblem;
      try {
        body = (await response.json()) as ApiProblem;
      } catch {
        body = {
          code: "HTTP_REQUEST_FAILED",
          message: `The local service returned HTTP ${response.status}.`,
          correlationId: response.headers.get("X-Correlation-ID") ?? "unknown",
        };
      }
      if (body.code === "LIBRARY_UNAVAILABLE") {
        window.dispatchEvent(new Event("library-unavailable"));
      }
      if (body.code === "INVALID_SESSION") {
        window.dispatchEvent(new Event("session-invalid"));
      }
      throw new ApiError(response.status, body);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  health(signal?: AbortSignal): Promise<HealthResponse> {
    return this.request("/api/v1/health", {}, { signal });
  }

  async libraryTransition(signal?: AbortSignal): Promise<LibraryTransition | null> {
    const result = await this.request<{ data: LibraryTransition | null }>(
      "/api/v1/library/transition",
      {},
      { signal },
    );
    return result.data;
  }

  async startLibraryTransition(
    action: LibraryTransitionAction,
    libraryRoot?: string,
  ): Promise<LibraryTransition> {
    const result = await this.request<{ data: LibraryTransition }>("/api/v1/library/transitions", {
      method: "POST",
      body: JSON.stringify({ action, ...(libraryRoot ? { libraryRoot } : {}) }),
    });
    return result.data;
  }

  commitLibraryTransition(transitionId: string): Promise<LibraryTransitionCommitResponse> {
    return this.request(`/api/v1/library/transitions/${encodeURIComponent(transitionId)}/commit`, {
      method: "POST",
      body: "{}",
    });
  }

  gallery(query: string, signal?: AbortSignal): Promise<GalleryResponse> {
    return this.request(`/api/v1/gallery${query}`, {}, { signal });
  }

  references(query: string, signal?: AbortSignal): Promise<GalleryResponse> {
    return this.request(`/api/v1/references${query}`, {}, { signal });
  }

  creations(
    query: string,
    signal?: AbortSignal,
  ): Promise<{ items: CreationSummary[]; page: GalleryResponse["page"] }> {
    return this.request(`/api/v1/creations${query}`, {}, { signal });
  }

  creation(id: string, signal?: AbortSignal): Promise<CreationDetail> {
    return this.request(`/api/v1/creations/${encodeURIComponent(id)}`, {}, { signal });
  }

  image(sha256: string, signal?: AbortSignal): Promise<ImageDetail> {
    return this.request(`/api/v1/images/${encodeURIComponent(sha256)}`, {}, { signal });
  }

  generation(id: string, signal?: AbortSignal): Promise<GenerationView> {
    return this.request(`/api/v1/generations/${encodeURIComponent(id)}`, {}, { signal });
  }

  generationIssues(signal?: AbortSignal): Promise<GenerationIssuesResponse> {
    return this.request("/api/v1/generation-issues", {}, { signal });
  }

  recovery(signal?: AbortSignal): Promise<RecoveryResponse> {
    return this.request("/api/v1/recovery", {}, { signal });
  }

  async patchImageCuration(sha256: string, request: CurationPatchRequest): Promise<ImageSummary> {
    const result = await this.request<MutationResponse<ImageSummary>>(
      `/api/v1/curation/images/${encodeURIComponent(sha256)}`,
      {
        method: "PATCH",
        body: JSON.stringify(request),
      },
    );
    return result.data;
  }

  async patchCreationCuration(id: string, request: CurationPatchRequest): Promise<CreationSummary> {
    const result = await this.request<MutationResponse<CreationSummary>>(
      `/api/v1/curation/creations/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(request),
      },
    );
    return result.data;
  }

  async saveDraft(id: string, request: DraftPutRequest): Promise<CreationDetail["draft"]> {
    const result = await this.request<MutationResponse<CreationDetail["draft"]>>(
      `/api/v1/creations/${encodeURIComponent(id)}/draft`,
      {
        method: "PUT",
        body: JSON.stringify(request),
      },
    );
    return result.data;
  }

  async preparePurge(
    kind: "creation" | "image",
    id: string,
    abandonRecoveryTransactionIds: string[] = [],
  ): Promise<PurgePlan> {
    const collection = kind === "creation" ? "creations" : "images";
    const result = await this.request<MutationResponse<PurgePlan>>(
      `/api/v1/purge/${collection}/${encodeURIComponent(id)}/prepare`,
      {
        method: "POST",
        body: JSON.stringify({ abandonRecoveryTransactionIds }),
      },
    );
    return result.data;
  }

  async executePurge(kind: "creation" | "image", id: string, plan: PurgePlan): Promise<void> {
    const collection = kind === "creation" ? "creations" : "images";
    const result = await this.request<{ data: unknown; bootstrap: BootstrapResponse }>(
      `/api/v1/purge/${collection}/${encodeURIComponent(id)}/execute`,
      {
        method: "POST",
        body: JSON.stringify({
          planDigest: plan.planDigest,
          confirmation: plan.confirmationPhrase,
          abandonRecoveryTransactionIds: plan.abandonedRecoveryTransactionIds,
        }),
      },
    );
    this.bootstrap.sessionToken = result.bootstrap.sessionToken;
  }

  async recoveryDryRun(
    transactionId: string,
    action: RecoveryAction,
  ): Promise<{ consequence: string; warnings: string[] }> {
    const result = await this.request<MutationResponse<Record<string, unknown>>>(
      `/api/v1/recovery/${encodeURIComponent(transactionId)}/${encodeURIComponent(action)}`,
      { method: "POST", body: JSON.stringify({ dryRun: true }) },
    );
    return {
      consequence:
        typeof result.data.consequence === "string"
          ? result.data.consequence
          : "Review the staged transaction before confirming this action.",
      warnings: Array.isArray(result.data.warnings)
        ? result.data.warnings.filter((value): value is string => typeof value === "string")
        : [],
    };
  }

  async recoveryAction(
    transactionId: string,
    action: RecoveryAction,
  ): Promise<Record<string, unknown>> {
    const result = await this.request<MutationResponse<Record<string, unknown>>>(
      `/api/v1/recovery/${encodeURIComponent(transactionId)}/${encodeURIComponent(action)}`,
      {
        method: "POST",
        body: JSON.stringify({ dryRun: false }),
      },
    );
    return result.data;
  }

  async rebuildIndex(): Promise<HealthResponse["index"]> {
    const result = await this.request<MutationResponse<HealthResponse["index"]>>(
      "/api/v1/index/rebuild",
      { method: "POST", body: "{}" },
    );
    return result.data;
  }
}

export async function loadBootstrap(
  signal?: AbortSignal,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<BootstrapResponse> {
  const response = await fetcher.call(globalThis, "/api/v1/bootstrap", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    let problem: ApiProblem;
    try {
      problem = (await response.json()) as ApiProblem;
    } catch {
      problem = {
        code: "BOOTSTRAP_FAILED",
        message: `The local service bootstrap returned HTTP ${response.status}.`,
        correlationId: response.headers.get("X-Correlation-ID") ?? "unknown",
      };
    }
    throw new ApiError(response.status, problem);
  }
  return (await response.json()) as BootstrapResponse;
}
