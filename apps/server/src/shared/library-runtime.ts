import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, realpath } from "node:fs/promises";
import { join } from "node:path";
import {
  canonicalizePossiblyMissing,
  initLibrary,
  persistLibrarySelection,
  validateLibrary,
} from "@text-to-image/archive";
import type {
  LibraryState,
  LibraryTransition,
  LibraryTransitionAction,
  LibraryUnavailable,
  LibraryUnavailableReason,
} from "@text-to-image/api-contract";
import { ReadModel, rebuildReadModel, ThumbnailCache } from "@text-to-image/read-model";
import { LibraryService } from "../library/library-service.js";
import { AppError, isErrorWithCode } from "./errors.js";
import { createArchiveAdapter } from "./archive-adapter.js";
import type { ArchivePort } from "./archive-port.js";

export interface LibraryContext {
  archive: ArchivePort;
  readModel: ReadModel;
  service: LibraryService;
  thumbnails: ThumbnailCache;
}

interface PreparedTransition {
  public: LibraryTransition;
  context: LibraryContext | null;
}

function unavailableState(
  libraryRoot: string,
  reason: LibraryUnavailableReason,
): LibraryUnavailable {
  return {
    status: "unavailable",
    libraryRoot,
    reason,
    allowedActions: ["initialize", "select", "retry"],
  };
}

async function unavailableReason(libraryRoot: string): Promise<LibraryUnavailableReason | null> {
  try {
    const info = await lstat(libraryRoot);
    if (!info.isDirectory()) return "missing_root";
    await access(libraryRoot, constants.R_OK);
  } catch (error) {
    if (isErrorWithCode(error) && (error.code === "EACCES" || error.code === "EPERM")) {
      return "permission_denied";
    }
    return "missing_root";
  }
  try {
    await access(join(libraryRoot, "library.json"), constants.R_OK);
    return null;
  } catch (error) {
    if (isErrorWithCode(error) && (error.code === "EACCES" || error.code === "EPERM")) {
      return "permission_denied";
    }
    return "missing_manifest";
  }
}

function copyTransition(transition: LibraryTransition): LibraryTransition {
  return { ...transition };
}

export class LibraryRuntime {
  readonly #gitRoot: string;
  #context: LibraryContext | null;
  #state: LibraryState;
  #transition: PreparedTransition | null = null;
  #activeRequests = 0;
  #drainWaiters: Array<() => void> = [];
  #switching = false;

  private constructor(gitRoot: string, libraryRoot: string, context: LibraryContext | null) {
    this.#gitRoot = gitRoot;
    this.#context = context;
    this.#state = context
      ? { status: "ready", libraryRoot: context.archive.libraryRoot }
      : unavailableState(libraryRoot, "missing_root");
  }

  static async create(options: {
    gitRoot: string;
    libraryArgument?: string;
  }): Promise<LibraryRuntime> {
    const archive = createArchiveAdapter(options);
    const reason = await unavailableReason(archive.libraryRoot);
    if (reason) {
      const runtime = new LibraryRuntime(options.gitRoot, archive.libraryRoot, null);
      runtime.#state = unavailableState(archive.libraryRoot, reason);
      return runtime;
    }
    const readModel = new ReadModel(archive.libraryRoot);
    await readModel.open();
    return new LibraryRuntime(options.gitRoot, archive.libraryRoot, {
      archive,
      readModel,
      service: new LibraryService(archive, readModel),
      thumbnails: new ThumbnailCache(archive.libraryRoot),
    });
  }

  get state(): LibraryState {
    return this.#state.status === "ready" ? { ...this.#state } : { ...this.#state };
  }

  get transition(): LibraryTransition | null {
    return this.#transition ? copyTransition(this.#transition.public) : null;
  }

  async acquire(): Promise<{ context: LibraryContext; release: () => void }> {
    if (this.#switching) {
      throw new AppError(
        "LIBRARY_SWITCHING",
        "The active Library is switching. Retry after the transition completes.",
        503,
      );
    }
    if (this.#state.status === "ready") {
      const reason = await unavailableReason(this.#state.libraryRoot);
      if (reason) this.#state = unavailableState(this.#state.libraryRoot, reason);
    }
    if (this.#state.status === "unavailable" || !this.#context) {
      throw new AppError(
        "LIBRARY_UNAVAILABLE",
        `The Asset Library is unavailable at ${this.#state.libraryRoot}.`,
        503,
        { ...this.#state },
        "Open Settings to initialize, select, or retry a Library.",
      );
    }
    this.#activeRequests += 1;
    const context = this.#context;
    let released = false;
    return {
      context,
      release: () => {
        if (released) return;
        released = true;
        this.#activeRequests -= 1;
        if (this.#activeRequests === 0)
          this.#drainWaiters.splice(0).forEach((resolve) => resolve());
      },
    };
  }

  async withContext<T>(action: (context: LibraryContext) => T | Promise<T>): Promise<T> {
    const lease = await this.acquire();
    try {
      return await action(lease.context);
    } finally {
      lease.release();
    }
  }

  startTransition(action: LibraryTransitionAction, libraryRoot?: string): LibraryTransition {
    if (
      this.#transition &&
      (this.#transition.public.stage === "preparing" ||
        this.#transition.public.stage === "ready" ||
        this.#transition.public.stage === "switching")
    ) {
      throw new AppError(
        "LIBRARY_TRANSITION_ACTIVE",
        "A Library transition is already active.",
        409,
        {
          transition: this.#transition.public,
        },
      );
    }
    this.#transition?.context?.readModel.close();
    if (action !== "retry" && !libraryRoot) {
      throw new AppError("LIBRARY_PATH_REQUIRED", "A Library path is required.", 422);
    }
    const requestedRoot =
      action === "retry"
        ? this.#state.libraryRoot
        : canonicalizePossiblyMissing(libraryRoot as string);
    const transition: PreparedTransition = {
      public: {
        id: randomUUID(),
        action,
        libraryRoot: requestedRoot,
        stage: "preparing",
        processed: 0,
        total: null,
        error: null,
      },
      context: null,
    };
    this.#transition = transition;
    void this.#prepare(transition);
    return copyTransition(transition.public);
  }

  async commitTransition(id: string): Promise<LibraryTransition> {
    const transition = this.#transition;
    if (!transition || transition.public.id !== id) {
      throw new AppError("LIBRARY_TRANSITION_NOT_FOUND", "Library transition was not found.", 404);
    }
    if (transition.public.stage !== "ready" || !transition.context) {
      throw new AppError(
        "LIBRARY_TRANSITION_NOT_READY",
        "Library transition is not ready to commit.",
        409,
        { transition: transition.public },
      );
    }

    const candidate = transition.context;
    transition.public.stage = "preparing";
    try {
      const status = await candidate.readModel.status();
      if (status.lagCount > 0) await candidate.readModel.rebuild();
      const preparedReport = validateLibrary(candidate.archive.libraryRoot, "quick");
      if (!preparedReport.valid) {
        throw new AppError("ARCHIVE_CORRUPTION", "Candidate Library validation failed.", 422, {
          diagnostics: preparedReport.diagnostics,
        });
      }

      transition.public.stage = "switching";
      this.#switching = true;
      await this.#drain();
      const finalStatus = await candidate.readModel.status();
      if (finalStatus.lagCount > 0) {
        throw new AppError(
          "LIBRARY_CANDIDATE_CHANGED",
          "Candidate Library changed during transition preparation. Start a new transition.",
          409,
        );
      }
      const finalReport = validateLibrary(candidate.archive.libraryRoot, "quick");
      if (!finalReport.valid) {
        throw new AppError("ARCHIVE_CORRUPTION", "Candidate Library validation failed.", 422, {
          diagnostics: finalReport.diagnostics,
        });
      }
      persistLibrarySelection(this.#gitRoot, candidate.archive.libraryRoot);
      const previous = this.#context;
      this.#context = candidate;
      transition.context = null;
      this.#state = { status: "ready", libraryRoot: candidate.archive.libraryRoot };
      try {
        previous?.readModel.close();
      } catch {
        // The new context is already durable and active; an obsolete read-only handle is non-fatal.
      }
      transition.public.stage = "succeeded";
      return copyTransition(transition.public);
    } catch (error) {
      try {
        transition.context?.readModel.close();
      } catch {
        // Preserve the original transition failure.
      }
      transition.context = null;
      transition.public.stage = "failed";
      transition.public.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.#switching = false;
    }
  }

  close(): void {
    this.#context?.readModel.close();
    this.#transition?.context?.readModel.close();
  }

  async #prepare(transition: PreparedTransition): Promise<void> {
    try {
      if (transition.public.action === "initialize") {
        initLibrary(transition.public.libraryRoot);
        transition.public.libraryRoot = await realpath(transition.public.libraryRoot);
      }
      const report = validateLibrary(transition.public.libraryRoot, "full");
      if (!report.valid) {
        throw new AppError("ARCHIVE_CORRUPTION", "Candidate Library validation failed.", 422, {
          diagnostics: report.diagnostics,
        });
      }
      await rebuildReadModel(transition.public.libraryRoot, (progress) => {
        transition.public.processed = progress.processed;
        transition.public.total = progress.total;
      });
      if (transition.public.total === null) {
        transition.public.processed = 1;
        transition.public.total = 1;
      }
      const archive = createArchiveAdapter({
        gitRoot: this.#gitRoot,
        libraryArgument: transition.public.libraryRoot,
      });
      const readModel = new ReadModel(archive.libraryRoot);
      await readModel.open({ rebuildIfMissing: false });
      transition.context = {
        archive,
        readModel,
        service: new LibraryService(archive, readModel),
        thumbnails: new ThumbnailCache(archive.libraryRoot),
      };
      transition.public.stage = "ready";
    } catch (error) {
      transition.context?.readModel.close();
      transition.context = null;
      transition.public.stage = "failed";
      transition.public.error = error instanceof Error ? error.message : String(error);
    }
  }

  async #drain(): Promise<void> {
    if (this.#activeRequests === 0) return;
    await new Promise<void>((resolveDrain) => this.#drainWaiters.push(resolveDrain));
  }
}
