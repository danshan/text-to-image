import { initLibrary } from "@text-to-image/archive";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { LibraryRuntime } from "./shared/library-runtime.js";

const apps: FastifyInstance[] = [];
const runtimes: LibraryRuntime[] = [];
const roots: string[] = [];

async function appFixture(unavailable = false): Promise<{
  app: FastifyInstance;
  token: string;
  runtime: LibraryRuntime;
  gitRoot: string;
}> {
  const gitRoot = await mkdtemp(join(tmpdir(), "text-to-image-security-"));
  roots.push(gitRoot);
  const libraryRoot = join(gitRoot, "library");
  if (!unavailable) initLibrary(libraryRoot);
  const runtime = await LibraryRuntime.create({ gitRoot, libraryArgument: libraryRoot });
  runtimes.push(runtime);
  const created = await createApp({
    runtime,
    logLevel: "silent",
  });
  created.security.allowHost("127.0.0.1:4173");
  apps.push(created.app);
  const response = await created.app.inject({
    method: "GET",
    url: "/api/v1/bootstrap",
    headers: { host: "127.0.0.1:4173" },
  });
  return {
    app: created.app,
    token: response.json<{ sessionToken: string }>().sessionToken,
    runtime,
    gitRoot,
  };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
  runtimes.splice(0).forEach((runtime) => runtime.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("local service security", () => {
  it("serves setup diagnostics while blocking Library APIs before initialization", async () => {
    const { app, token } = await appFixture(true);
    const bootstrap = await app.inject({
      method: "GET",
      url: "/api/v1/bootstrap",
      headers: { host: "127.0.0.1:4173" },
    });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json()).toMatchObject({
      library: { status: "unavailable", reason: "missing_root" },
      capabilities: { curation: false, recovery: false, libraryManagement: true },
    });

    const ready = await app.inject({
      method: "GET",
      url: "/ready",
      headers: { host: "127.0.0.1:4173" },
    });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({ status: "unavailable" });

    const gallery = await app.inject({
      method: "GET",
      url: "/api/v1/gallery",
      headers: { host: "127.0.0.1:4173", "x-session-token": token },
    });
    expect(gallery.statusCode).toBe(503);
    expect(gallery.json()).toMatchObject({
      code: "LIBRARY_UNAVAILABLE",
      recoveryHint: "Open Settings to initialize, select, or retry a Library.",
    });

    const directories = await app.inject({
      method: "GET",
      url: "/api/v1/library/directories?path=/",
      headers: { host: "127.0.0.1:4173", "x-session-token": token },
    });
    expect(directories.statusCode).toBe(404);
  });

  it("requires the rotating session token for Library reads", async () => {
    const { app, token } = await appFixture();
    const denied = await app.inject({
      method: "GET",
      url: "/api/v1/gallery",
      headers: { host: "127.0.0.1:4173" },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ code: "INVALID_SESSION" });

    const allowed = await app.inject({
      method: "GET",
      url: "/api/v1/gallery",
      headers: { host: "127.0.0.1:4173", "x-session-token": token },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers["access-control-allow-origin"]).toBeUndefined();
    expect(allowed.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(allowed.headers["x-correlation-id"]).toBeTypeOf("string");
  });

  it("exposes the bounded Generation Issues projection", async () => {
    const { app, token } = await appFixture();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/generation-issues?limit=1",
      headers: { host: "127.0.0.1:4173", "x-session-token": token },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], page: { nextCursor: null, total: 0 } });
  });

  it("allows the SPA shell to load before bootstrap provides a token", async () => {
    const { app } = await appFixture();
    const response = await app.inject({
      method: "GET",
      url: "/gallery",
      headers: { host: "127.0.0.1:4173" },
    });

    expect(response.statusCode).not.toBe(403);
  });

  it("rejects hostile Host and Origin headers", async () => {
    const { app, token } = await appFixture();
    const invalidHost = await app.inject({
      method: "GET",
      url: "/health",
      headers: { host: "attacker.invalid" },
    });
    expect(invalidHost.statusCode).toBe(403);

    const invalidOrigin = await app.inject({
      method: "GET",
      url: "/api/v1/gallery",
      headers: {
        host: "127.0.0.1:4173",
        origin: "https://attacker.invalid",
        "x-session-token": token,
      },
    });
    expect(invalidOrigin.statusCode).toBe(403);
    expect(invalidOrigin.json()).toMatchObject({ code: "INVALID_ORIGIN" });
  });

  it("rotates the session token for each server process", async () => {
    const first = await appFixture();
    const second = await appFixture();
    expect(first.token).not.toBe(second.token);
    expect(first.token.length).toBeGreaterThanOrEqual(40);
  });

  it("rotates the session token after an atomic Library switch", async () => {
    const { app, token, runtime, gitRoot } = await appFixture();
    const target = join(gitRoot, "alternate-library");
    const started = await app.inject({
      method: "POST",
      url: "/api/v1/library/transitions",
      headers: { host: "127.0.0.1:4173", "x-session-token": token },
      payload: { action: "initialize", libraryRoot: target },
    });
    expect(started.statusCode).toBe(202);
    const transitionId = started.json<{ data: { id: string } }>().data.id;
    for (
      let attempt = 0;
      attempt < 100 && runtime.transition?.stage === "preparing";
      attempt += 1
    ) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }

    const committed = await app.inject({
      method: "POST",
      url: `/api/v1/library/transitions/${transitionId}/commit`,
      headers: { host: "127.0.0.1:4173", "x-session-token": token },
      payload: {},
    });
    expect(committed.statusCode).toBe(200);
    const nextToken = committed.json<{ bootstrap: { sessionToken: string } }>().bootstrap
      .sessionToken;
    expect(nextToken).not.toBe(token);

    const stale = await app.inject({
      method: "GET",
      url: "/api/v1/gallery",
      headers: { host: "127.0.0.1:4173", "x-session-token": token },
    });
    expect(stale.statusCode).toBe(403);

    const current = await app.inject({
      method: "GET",
      url: "/api/v1/gallery",
      headers: { host: "127.0.0.1:4173", "x-session-token": nextToken },
    });
    expect(current.statusCode).toBe(200);
  });
});
