import { spawn, spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const daemonEntrypoint = join(repositoryRoot, "scripts", "daemon.mts");
const tsxLoader = createRequire(import.meta.url).resolve("tsx");
let testRoot: string;
let environment: NodeJS.ProcessEnv;

function npmScript(name: string, arguments_: string[] = []) {
  return spawnSync("npm", ["run", name, ...(arguments_.length > 0 ? ["--", ...arguments_] : [])], {
    cwd: repositoryRoot,
    env: environment,
    encoding: "utf8",
    timeout: 90_000,
  });
}

async function followLogUntilReady(): Promise<{ output: string; exitCode: number | null }> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["--import", tsxLoader, daemonEntrypoint, "logs"], {
      cwd: repositoryRoot,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let error = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Timed out while following daemon log: ${error}`));
    }, 5_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      if (output.includes("Text to Image local service is ready")) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk: string) => {
      error += chunk;
    });
    child.once("error", reject);
    child.once("exit", (exitCode) => {
      clearTimeout(timeout);
      resolvePromise({ output, exitCode });
    });
  });
}

describe("daemon lifecycle", () => {
  beforeAll(async () => {
    testRoot = await mkdtemp(join(tmpdir(), "text-to-image-daemon-test-"));
    const libraryRoot = join(testRoot, "library");
    await cp(join(repositoryRoot, "fixtures", "asset-libraries", "v1-minimal"), libraryRoot, {
      recursive: true,
    });
    environment = {
      ...process.env,
      NODE_ENV: "test",
      TEXT_TO_IMAGE_HOST: "127.0.0.1",
      TEXT_TO_IMAGE_LIBRARY: libraryRoot,
      TEXT_TO_IMAGE_LOG_LEVEL: "info",
      TEXT_TO_IMAGE_PORT: "0",
      TEXT_TO_IMAGE_TEST_DAEMON_RUNTIME: join(testRoot, "runtime"),
    };
  });

  afterAll(async () => {
    if (environment) npmScript("daemon:stop");
    if (testRoot) await rm(testRoot, { recursive: true, force: true });
  });

  it("waits for readiness, reports status and stops with SIGTERM", async () => {
    const started = npmScript("daemon", ["--host", "127.0.0.1"]);
    expect(started.status, started.stderr).toBe(0);

    const metadata = JSON.parse(
      await readFile(join(testRoot, "runtime", "metadata.json"), "utf8"),
    ) as { pid: number; urls: string[] };
    const health = await fetch(new URL("/api/v1/health", metadata.urls[0]));
    expect(health.status).toBe(200);

    const idempotent = npmScript("daemon", ["--host", "127.0.0.1"]);
    expect(idempotent.status, idempotent.stderr).toBe(0);
    const unchanged = JSON.parse(
      await readFile(join(testRoot, "runtime", "metadata.json"), "utf8"),
    ) as { pid: number };
    expect(unchanged.pid).toBe(metadata.pid);

    const running = npmScript("daemon:status");
    expect(running.status, running.stderr).toBe(0);
    expect(running.stdout).toContain("running pid=");

    const followed = await followLogUntilReady();
    expect(followed.exitCode).toBe(0);
    expect(followed.output).toContain("Text to Image local service is ready");

    const stopped = npmScript("daemon:stop");
    expect(stopped.status, stopped.stderr).toBe(0);
    expect(stopped.stdout).toContain("stopped pid=");

    const status = npmScript("daemon:status");
    expect(status.status).toBe(1);
    expect(status.stdout).toContain("stopped log=");

    const log = await readFile(join(testRoot, "runtime", "server.log"), "utf8");
    expect(log).toContain("Text to Image local service is ready");
  }, 90_000);
});
