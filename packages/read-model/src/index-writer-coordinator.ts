import { DatabaseSync } from "node:sqlite";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const INDEX_WRITER_TIMEOUT_MS = 8_000;

export type IndexCoordinationCode = "INDEX_WRITER_BUSY" | "INDEX_COORDINATOR_FAILED";

export class IndexCoordinationError extends Error {
  readonly code: IndexCoordinationCode;

  constructor(code: IndexCoordinationCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IndexCoordinationError";
    this.code = code;
  }
}

export interface IndexWriterOptions {
  timeoutMs?: number;
  retryIntervalMs?: number;
  sqliteTimeoutMs?: number;
  onAcquired?: () => void;
  onReleasing?: () => void;
}

function isSqliteBusy(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const sqlite = error as Error & { errcode?: unknown; errstr?: unknown };
  return (
    sqlite.errcode === 5 ||
    sqlite.errcode === 6 ||
    sqlite.errstr === "database is locked" ||
    sqlite.errstr === "database table is locked"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function withIndexWriter<T>(
  libraryRoot: string,
  operation: () => Promise<T>,
  options: IndexWriterOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? INDEX_WRITER_TIMEOUT_MS;
  const retryIntervalMs = options.retryIntervalMs ?? 25;
  const sqliteTimeoutMs = options.sqliteTimeoutMs ?? 50;
  const cacheDirectory = join(resolve(libraryRoot), ".cache");
  await mkdir(cacheDirectory, { recursive: true });

  let coordinator: DatabaseSync;
  try {
    coordinator = new DatabaseSync(join(cacheDirectory, "index-writer.sqlite"), {
      timeout: sqliteTimeoutMs,
    });
  } catch (error) {
    throw new IndexCoordinationError(
      "INDEX_COORDINATOR_FAILED",
      `Index coordinator could not be opened: ${errorMessage(error)}`,
      { cause: error },
    );
  }

  const deadline = Date.now() + timeoutMs;
  let acquired = false;
  try {
    while (true) {
      try {
        coordinator.exec("BEGIN IMMEDIATE");
        acquired = true;
        break;
      } catch (error) {
        if (!isSqliteBusy(error)) {
          throw new IndexCoordinationError(
            "INDEX_COORDINATOR_FAILED",
            `Index coordinator failed to acquire its transaction: ${errorMessage(error)}`,
            { cause: error },
          );
        }
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          throw new IndexCoordinationError(
            "INDEX_WRITER_BUSY",
            `Index writer remained busy for ${timeoutMs} ms.`,
            { cause: error },
          );
        }
        await delay(Math.min(retryIntervalMs, remainingMs));
      }
    }

    options.onAcquired?.();
    return await operation();
  } finally {
    try {
      if (acquired) options.onReleasing?.();
    } finally {
      if (coordinator.isTransaction) {
        try {
          coordinator.exec("ROLLBACK");
        } catch {
          // Closing the connection still releases the OS-managed lock.
        }
      }
      coordinator.close();
    }
  }
}
