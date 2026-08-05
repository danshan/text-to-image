import { fork, type ChildProcess } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCreation, initLibrary } from "../../packages/archive/src/index.js";
import {
  ReadModel,
  catchUpReadModel,
  withIndexWriter,
} from "../../packages/read-model/src/index.js";

interface WorkerMessage {
  type: "acquired" | "error" | "held" | "ready" | "result";
  error?: string;
  result?: unknown;
}

interface WorkerHandle {
  child: ChildProcess;
  messages: WorkerMessage[];
  waitFor(type: WorkerMessage["type"]): Promise<WorkerMessage>;
  completed: Promise<{ code: number | null; stderr: string }>;
}

const roots: string[] = [];
const children = new Set<ChildProcess>();

function worker(
  action: "catch-up" | "hold" | "open" | "rebuild",
  libraryRoot: string,
  options: { guardPath?: string; rebuildLogPath?: string } = {},
): WorkerHandle {
  const child = fork(join(process.cwd(), "tests/helpers/index-writer-worker.ts"), [], {
    execArgv: ["--import", "tsx"],
    env: {
      ...process.env,
      TEXT_TO_IMAGE_INDEX_WORKER_ACTION: action,
      TEXT_TO_IMAGE_INDEX_WORKER_LIBRARY: libraryRoot,
      ...(options.guardPath ? { TEXT_TO_IMAGE_INDEX_WORKER_GUARD: options.guardPath } : {}),
      ...(options.rebuildLogPath
        ? { TEXT_TO_IMAGE_INDEX_WORKER_REBUILD_LOG: options.rebuildLogPath }
        : {}),
    },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  children.add(child);
  const messages: WorkerMessage[] = [];
  const waiters = new Map<WorkerMessage["type"], Array<(message: WorkerMessage) => void>>();
  child.on("message", (message: WorkerMessage) => {
    messages.push(message);
    waiters.get(message.type)?.shift()?.(message);
  });
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  const completed = new Promise<{ code: number | null; stderr: string }>((resolve) => {
    child.once("exit", (code) => {
      children.delete(child);
      resolve({ code, stderr });
    });
  });
  return {
    child,
    messages,
    waitFor: async (type) => {
      const existing = messages.find((message) => message.type === type);
      if (existing) return existing;
      return new Promise<WorkerMessage>((resolve) => {
        const pending = waiters.get(type) ?? [];
        pending.push(resolve);
        waiters.set(type, pending);
      });
    },
    completed,
  };
}

async function fixture(): Promise<{ owner: string; libraryRoot: string }> {
  const owner = await mkdtemp(join(tmpdir(), "text-to-image-index-coordination-"));
  roots.push(owner);
  const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;
  createCreation(libraryRoot, { title: "Initial" });
  const readModel = new ReadModel(libraryRoot);
  await readModel.rebuild();
  readModel.close();
  return { owner, libraryRoot };
}

afterEach(async () => {
  for (const child of children) child.kill("SIGKILL");
  await Promise.all(
    [...children].map((child) => new Promise((resolve) => child.once("exit", resolve))),
  );
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});

describe("cross-process read model coordination", () => {
  it("serializes one rebuild and three catch-up writers across processes", async () => {
    const { owner, libraryRoot } = await fixture();
    for (let index = 0; index < 4; index += 1) {
      createCreation(libraryRoot, { title: `Concurrent ${index}` });
    }
    const guardPath = join(owner, "writer.guard");
    const workers = (["rebuild", "catch-up", "catch-up", "catch-up"] as const).map((action) =>
      worker(action, libraryRoot, { guardPath }),
    );
    await Promise.all(workers.map((handle) => handle.waitFor("ready")));
    for (const handle of workers) handle.child.send("start");
    const completed = await Promise.all(workers.map((handle) => handle.completed));

    expect(completed).toEqual(completed.map(() => ({ code: 0, stderr: "" })));
    expect(
      workers.flatMap((handle) => handle.messages).some((message) => message.type === "error"),
    ).toBe(false);
    await expect(access(guardPath)).rejects.toMatchObject({ code: "ENOENT" });

    const finalModel = new ReadModel(libraryRoot);
    await finalModel.open();
    expect(await finalModel.status()).toMatchObject({ lagCount: 0 });
    expect(finalModel.listCreations()).toHaveLength(5);
    finalModel.close();
  });

  it("returns typed busy degradation and releases the lock when its owner exits", async () => {
    const { libraryRoot } = await fixture();
    const observer = new ReadModel(libraryRoot, {
      writer: { timeoutMs: 50, sqliteTimeoutMs: 5, retryIntervalMs: 5 },
    });
    await observer.open();
    createCreation(libraryRoot, { title: "Pending" });
    const holder = worker("hold", libraryRoot);
    await holder.waitFor("ready");
    holder.child.send("start");
    await holder.waitFor("held");

    const degraded = await observer.catchUp();
    expect(degraded).toMatchObject({
      status: "degraded",
      code: "INDEX_WRITER_BUSY",
      lagCount: 1,
    });
    expect(await observer.status()).toMatchObject({
      degraded: true,
      code: "INDEX_WRITER_BUSY",
      lagCount: 1,
    });

    holder.child.kill("SIGKILL");
    await holder.completed;
    await expect(
      withIndexWriter(libraryRoot, () => Promise.resolve("recovered"), {
        timeoutMs: 500,
        sqliteTimeoutMs: 5,
        retryIntervalMs: 5,
      }),
    ).resolves.toBe("recovered");
    await expect(catchUpReadModel(libraryRoot)).resolves.toMatchObject({
      status: "ready",
      lagCount: 0,
    });
    const recoveredStatus = await observer.status();
    expect(recoveredStatus).toMatchObject({ available: true, lagCount: 0 });
    expect(recoveredStatus.code).toBeUndefined();
    expect(recoveredStatus.degraded).toBeUndefined();
    observer.close();
  });

  it("lets only the first lock holder rebuild a corrupt index", async () => {
    const { owner, libraryRoot } = await fixture();
    await writeFile(join(libraryRoot, ".cache", "index.sqlite"), "not a sqlite database");
    const guardPath = join(owner, "writer.guard");
    const rebuildLogPath = join(owner, "rebuild.log");
    const workers = Array.from({ length: 4 }, () =>
      worker("open", libraryRoot, { guardPath, rebuildLogPath }),
    );
    await Promise.all(workers.map((handle) => handle.waitFor("ready")));
    for (const handle of workers) handle.child.send("start");
    const completed = await Promise.all(workers.map((handle) => handle.completed));

    expect(completed).toEqual(completed.map(() => ({ code: 0, stderr: "" })));
    expect((await readFile(rebuildLogPath, "utf8")).trim().split("\n")).toHaveLength(1);
    const finalModel = new ReadModel(libraryRoot);
    await finalModel.open();
    expect(await finalModel.status()).toMatchObject({ available: true, lagCount: 0 });
    finalModel.close();
  });
});
