import type { ArchivePort } from "./shared/archive-port.js";
import type { LibraryService } from "./library/library-service.js";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";

const apps: FastifyInstance[] = [];

function fakeArchive(): ArchivePort {
  return {
    libraryRoot: "/tmp/text-to-image-test-library",
    formatVersion: 1,
    readOnly: false,
    diagnostics: () => Promise.resolve([]),
    createCreation: () => Promise.resolve({ id: "f69e912d-c504-4278-89d5-4558ba452df0" }),
    updateCreationCuration: () => Promise.resolve({}),
    updateImageCuration: () => Promise.resolve({}),
    updateDraft: () => Promise.resolve({}),
    importImage: () => Promise.resolve({ sha256: "0".repeat(64) }),
    listRecovery: () =>
      Promise.resolve({
        items: [],
        quarantineCount: 0,
        lock: { present: false, owner: null },
      }),
    recover: () => Promise.resolve({}),
  };
}

function fakeService(): LibraryService {
  const gallery = { items: [], page: { nextCursor: null, total: 0 } };
  return {
    readModel: {
      status: () =>
        Promise.resolve({
          available: true,
          latestArchiveMarker: null,
          lastIndexedMarker: null,
          lagCount: 0,
        }),
      listCreations: () => [],
    },
    gallery: () => gallery,
    references: () => gallery,
  } as unknown as LibraryService;
}

async function appFixture(): Promise<{ app: FastifyInstance; token: string }> {
  const created = await createApp({
    archive: fakeArchive(),
    service: fakeService(),
    logLevel: "silent",
  });
  created.security.allowHost("127.0.0.1:4173");
  apps.push(created.app);
  const response = await created.app.inject({
    method: "GET",
    url: "/api/v1/bootstrap",
    headers: { host: "127.0.0.1:4173" },
  });
  return { app: created.app, token: response.json<{ sessionToken: string }>().sessionToken };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe("local service security", () => {
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
});
