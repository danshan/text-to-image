import { DatabaseSync } from "node:sqlite";
import { appendFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ReadModel,
  READ_MODEL_VERSION,
  catchUpReadModel,
  rebuildReadModel,
  withIndexWriter,
  type IndexWriterOptions,
} from "../../packages/read-model/src/index.js";

type WorkerAction = "catch-up" | "hold" | "open" | "rebuild";

const action = process.env.TEXT_TO_IMAGE_INDEX_WORKER_ACTION as WorkerAction | undefined;
const libraryRoot = process.env.TEXT_TO_IMAGE_INDEX_WORKER_LIBRARY;
const guardPath = process.env.TEXT_TO_IMAGE_INDEX_WORKER_GUARD;
const rebuildLogPath = process.env.TEXT_TO_IMAGE_INDEX_WORKER_REBUILD_LOG;

if (!action || !libraryRoot) throw new Error("Index worker configuration is incomplete.");

function send(message: Record<string, unknown>): void {
  process.send?.(message);
}

function currentIndexIsUsable(): boolean {
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(join(libraryRoot!, ".cache", "index.sqlite"), {
      readOnly: true,
    });
    const schema = database.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
      { value?: unknown } | undefined;
    const journal = database.prepare("PRAGMA journal_mode").get() as
      { journal_mode?: unknown } | undefined;
    return schema?.value === String(READ_MODEL_VERSION) && journal?.journal_mode === "delete";
  } catch {
    return false;
  } finally {
    database?.close();
  }
}

async function waitForStart(): Promise<void> {
  await new Promise<void>((resolve) => {
    process.once("message", (message) => {
      if (message === "start") resolve();
    });
    send({ type: "ready" });
  });
}

await waitForStart();

if (action === "hold") {
  await withIndexWriter(libraryRoot, async () => {
    send({ type: "held" });
    await new Promise<never>(() => setInterval(() => undefined, 1_000));
  });
} else {
  let ownsGuard = false;
  const writer: IndexWriterOptions = {
    timeoutMs: 2_000,
    sqliteTimeoutMs: 10,
    retryIntervalMs: 5,
    onAcquired: () => {
      if (guardPath) {
        writeFileSync(guardPath, String(process.pid), { flag: "wx" });
        ownsGuard = true;
      }
      if (action === "open" && rebuildLogPath && !currentIndexIsUsable()) {
        appendFileSync(rebuildLogPath, `${process.pid}\n`);
      }
      send({ type: "acquired" });
    },
    onReleasing: () => {
      if (ownsGuard && guardPath) {
        rmSync(guardPath, { force: true });
        ownsGuard = false;
      }
    },
  };

  try {
    let result: unknown;
    if (action === "rebuild") {
      result = await rebuildReadModel(libraryRoot, undefined, writer);
    } else if (action === "catch-up") {
      result = await catchUpReadModel(libraryRoot, undefined, { writer });
    } else {
      const readModel = new ReadModel(libraryRoot, { writer });
      try {
        await readModel.open();
        result = await readModel.status();
      } finally {
        readModel.close();
      }
    }
    send({ type: "result", result });
  } catch (error) {
    send({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  } finally {
    if (ownsGuard && guardPath) rmSync(guardPath, { force: true });
  }
}
