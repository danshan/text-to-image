import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, createReadStream, openSync } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { once } from "node:events";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const runtimeDirectory =
  process.env.NODE_ENV === "test" && process.env.TEXT_TO_IMAGE_TEST_DAEMON_RUNTIME
    ? resolve(process.env.TEXT_TO_IMAGE_TEST_DAEMON_RUNTIME)
    : resolve(repositoryRoot, ".runtime", "daemon");
const metadataPath = resolve(runtimeDirectory, "metadata.json");
const logPath = resolve(runtimeDirectory, "server.log");
const lockPath = resolve(runtimeDirectory, "operation.lock");
const serverEntrypoint = resolve(repositoryRoot, "apps", "server", "src", "main.ts");
const tsxLoader = createRequire(import.meta.url).resolve("tsx");
const START_TIMEOUT_MS = 60_000;
const STOP_TIMEOUT_MS = 10_000;
const LOCK_STALE_MS = 120_000;

export interface DaemonMetadata {
  version: 1;
  pid: number;
  instanceId: string;
  startedAt: string;
  urls: string[];
  logPath: string;
}

type StoredMetadata =
  { kind: "missing" } | { kind: "invalid" } | { kind: "valid"; metadata: DaemonMetadata };

interface ReadyMessage {
  type: "text-to-image-ready";
  pid: number;
  urls: string[];
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function daemonProcessName(instanceId: string): string {
  return `text-to-image-daemon-${instanceId}`;
}

export function parseDaemonMetadata(raw: string): DaemonMetadata | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    !Number.isSafeInteger(candidate.pid) ||
    Number(candidate.pid) < 1 ||
    typeof candidate.instanceId !== "string" ||
    !/^[a-f0-9]{16}$/.test(candidate.instanceId) ||
    typeof candidate.startedAt !== "string" ||
    Number.isNaN(Date.parse(candidate.startedAt)) ||
    !Array.isArray(candidate.urls) ||
    candidate.urls.length === 0 ||
    !candidate.urls.every((url) => typeof url === "string" && isHttpUrl(url)) ||
    typeof candidate.logPath !== "string"
  ) {
    return undefined;
  }
  return candidate as unknown as DaemonMetadata;
}

function isHttpUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "http:";
  } catch {
    return false;
  }
}

function parseReadyMessage(value: unknown, pid: number): ReadyMessage | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.type !== "text-to-image-ready" ||
    candidate.pid !== pid ||
    !Array.isArray(candidate.urls) ||
    candidate.urls.length === 0 ||
    !candidate.urls.every((url) => typeof url === "string" && isHttpUrl(url))
  ) {
    return undefined;
  }
  return candidate as unknown as ReadyMessage;
}

async function readMetadata(): Promise<StoredMetadata> {
  try {
    const metadata = parseDaemonMetadata(await readFile(metadataPath, "utf8"));
    return metadata ? { kind: "valid", metadata } : { kind: "invalid" };
  } catch (error) {
    if (errorCode(error) === "ENOENT") return { kind: "missing" };
    throw error;
  }
}

function processIsRunning(metadata: DaemonMetadata): boolean {
  try {
    process.kill(metadata.pid, 0);
  } catch (error) {
    if (errorCode(error) !== "EPERM") return false;
  }
  const result = spawnSync("ps", ["-ww", "-p", String(metadata.pid), "-o", "command="], {
    encoding: "utf8",
  });
  if (result.status !== 0) return false;
  const expected = daemonProcessName(metadata.instanceId);
  const command = result.stdout.trim();
  return command === expected || command.startsWith(`${expected} `);
}

async function writeMetadata(metadata: DaemonMetadata): Promise<void> {
  const temporaryPath = `${metadataPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, metadataPath);
}

async function withOperationLock<T>(operation: () => Promise<T>): Promise<T> {
  await mkdir(runtimeDirectory, { recursive: true });
  let handle;
  try {
    try {
      handle = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      const age = Date.now() - (await stat(lockPath)).mtimeMs;
      if (age <= LOCK_STALE_MS) throw new Error("Another daemon operation is in progress");
      await unlink(lockPath);
      handle = await open(lockPath, "wx", 0o600);
    }
    await handle.writeFile(`${process.pid}\n`);
    return await operation();
  } finally {
    await handle?.close();
    await rm(lockPath, { force: true });
  }
}

function waitForReady(child: ChildProcess, pid: number): Promise<ReadyMessage> {
  return new Promise((resolvePromise, reject) => {
    const cleanup = (): void => {
      clearTimeout(timeout);
      child.off("error", onError);
      child.off("exit", onExit);
      child.off("message", onMessage);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      cleanup();
      reject(
        new Error(`Daemon exited before readiness: code=${String(code)} signal=${String(signal)}`),
      );
    };
    const onMessage = (value: unknown): void => {
      const message = parseReadyMessage(value, pid);
      if (!message) return;
      cleanup();
      resolvePromise(message);
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Daemon did not become ready within ${START_TIMEOUT_MS / 1000} seconds`));
    }, START_TIMEOUT_MS);
    child.once("error", onError);
    child.once("exit", onExit);
    child.on("message", onMessage);
  });
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return await Promise.race([
    once(child, "exit").then(() => true),
    new Promise<false>((resolvePromise) => setTimeout(() => resolvePromise(false), timeoutMs)),
  ]);
}

function buildWeb(): void {
  const result = spawnSync("npm", ["run", "build:web"], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error("Web build failed; daemon was not started");
}

function printRunning(metadata: DaemonMetadata): void {
  process.stdout.write(
    `running pid=${metadata.pid} started=${metadata.startedAt} urls=${metadata.urls.join(",")} log=${logPath}\n`,
  );
}

async function start(serverArguments: string[]): Promise<number> {
  return await withOperationLock(async () => {
    const stored = await readMetadata();
    if (stored.kind === "valid" && processIsRunning(stored.metadata)) {
      printRunning(stored.metadata);
      return 0;
    }
    if (stored.kind !== "missing") await rm(metadataPath, { force: true });

    buildWeb();
    const instanceId = randomBytes(8).toString("hex");
    const logDescriptor = openSync(logPath, "w", 0o600);
    const child = spawn(
      process.execPath,
      ["--env-file-if-exists=.env", "--import", tsxLoader, serverEntrypoint, ...serverArguments],
      {
        argv0: daemonProcessName(instanceId),
        cwd: repositoryRoot,
        detached: true,
        env: process.env,
        stdio: ["ignore", logDescriptor, logDescriptor, "ipc"],
      },
    );
    closeSync(logDescriptor);
    const pid = child.pid;
    if (pid === undefined) throw new Error("Daemon process did not expose a PID");

    try {
      const ready = await waitForReady(child, pid);
      const metadata: DaemonMetadata = {
        version: 1,
        pid,
        instanceId,
        startedAt: new Date().toISOString(),
        urls: ready.urls,
        logPath,
      };
      await writeMetadata(metadata);
      child.disconnect();
      child.unref();
      printRunning(metadata);
      return 0;
    } catch (error) {
      child.kill("SIGTERM");
      const exited = await waitForExit(child, STOP_TIMEOUT_MS);
      if (child.connected) child.disconnect();
      child.unref();
      if (!exited) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${message}; PID ${pid} did not exit after SIGTERM`);
      }
      throw error;
    }
  });
}

async function stop(): Promise<number> {
  return await withOperationLock(async () => {
    const stored = await readMetadata();
    if (stored.kind === "missing") {
      process.stdout.write(`stopped log=${logPath}\n`);
      return 0;
    }
    if (stored.kind === "invalid" || !processIsRunning(stored.metadata)) {
      await rm(metadataPath, { force: true });
      process.stdout.write(`stale cleaned=true log=${logPath}\n`);
      return 0;
    }

    process.kill(stored.metadata.pid, "SIGTERM");
    const deadline = Date.now() + STOP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!processIsRunning(stored.metadata)) {
        await rm(metadataPath, { force: true });
        process.stdout.write(`stopped pid=${stored.metadata.pid} log=${logPath}\n`);
        return 0;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
    throw new Error(`Daemon PID ${stored.metadata.pid} did not exit within 10 seconds`);
  });
}

async function status(): Promise<number> {
  const stored = await readMetadata();
  if (stored.kind === "missing") {
    process.stdout.write(`stopped log=${logPath}\n`);
    return 1;
  }
  if (stored.kind === "invalid") {
    process.stdout.write(`stale reason=invalid_metadata log=${logPath}\n`);
    return 1;
  }
  if (!processIsRunning(stored.metadata)) {
    process.stdout.write(`stale pid=${stored.metadata.pid} log=${logPath}\n`);
    return 1;
  }
  printRunning(stored.metadata);
  return 0;
}

async function writeLogFrom(position: number): Promise<number> {
  let size: number;
  try {
    size = (await stat(logPath)).size;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return position;
    throw error;
  }
  const start = size < position ? 0 : position;
  if (size === start) return start;
  const stream = createReadStream(logPath, { start, end: size - 1 });
  for await (const chunk of stream) {
    if (!process.stdout.write(chunk)) await once(process.stdout, "drain");
  }
  return size;
}

async function logs(): Promise<number> {
  try {
    await stat(logPath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") throw new Error(`Daemon log does not exist: ${logPath}`);
    throw error;
  }
  let following = true;
  let position = 0;
  const stopFollowing = (): void => {
    following = false;
  };
  process.once("SIGINT", stopFollowing);
  process.once("SIGTERM", stopFollowing);
  try {
    while (following) {
      position = await writeLogFrom(position);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
  } finally {
    process.off("SIGINT", stopFollowing);
    process.off("SIGTERM", stopFollowing);
  }
  return 0;
}

export async function runDaemon(arguments_: string[]): Promise<number> {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    throw new Error(`Daemon mode is not supported on ${process.platform}`);
  }
  const [command, ...rest] = arguments_;
  if (command === "start") return await start(rest);
  if (command === "stop") return await stop();
  if (command === "status") return await status();
  if (command === "logs") return await logs();
  throw new Error("Usage: daemon.mts <start|stop|status|logs>");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDaemon(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
