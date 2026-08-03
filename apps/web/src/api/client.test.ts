import { describe, expect, it, vi } from "vitest";
import { ApiClient, loadBootstrap } from "./client";

const bootstrap = {
  apiVersion: "v1" as const,
  libraryFormatVersion: 1,
  sessionToken: "session-secret",
  library: { status: "ready" as const, libraryRoot: "/tmp/image-library" },
  capabilities: {
    curation: true,
    recovery: true,
    libraryManagement: true as const,
    generationFromWeb: false as const,
  },
};

describe("ApiClient", () => {
  it("loads bootstrap without cache or a session token", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(bootstrap));

    await loadBootstrap(undefined, fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/bootstrap",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      }),
    );
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).has("X-Session-Token")).toBe(false);
  });

  it("sends the ephemeral token for sensitive read requests", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ items: [], page: { nextCursor: null, total: 0 } }));
    const client = new ApiClient(bootstrap, fetcher);

    await client.gallery("");

    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("X-Session-Token")).toBe("session-secret");
  });

  it("binds a browser-style fetch implementation to globalThis", async () => {
    const fetcher = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(Response.json({ items: [], page: { nextCursor: null, total: 0 } }));
    });
    const client = new ApiClient(bootstrap, fetcher);

    await expect(client.gallery("")).resolves.toEqual({
      items: [],
      page: { nextCursor: null, total: 0 },
    });
  });

  it("sends recovery dry-run as a JSON request body", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ data: { consequence: "Safe", warnings: [] } }));
    const client = new ApiClient(bootstrap, fetcher);

    await client.recoveryDryRun("transaction-1", "commit");

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/recovery/transaction-1/commit",
      expect.objectContaining({ body: JSON.stringify({ dryRun: true }) }),
    );
  });

  it("loads the bounded latest Generation Issues response", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ items: [], page: { nextCursor: null, total: 0 } }));
    const client = new ApiClient(bootstrap, fetcher);

    await expect(client.generationIssues()).resolves.toEqual({
      items: [],
      page: { nextCursor: null, total: 0 },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/generation-issues",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("notifies the application when a data request detects Library Unavailable", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json(
        {
          code: "LIBRARY_UNAVAILABLE",
          message: "The Asset Library is unavailable.",
          correlationId: "request-1",
        },
        { status: 503 },
      ),
    );
    const listener = vi.fn();
    window.addEventListener("library-unavailable", listener);
    const client = new ApiClient(bootstrap, fetcher);

    await expect(client.gallery("")).rejects.toMatchObject({
      body: { code: "LIBRARY_UNAVAILABLE" },
    });
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("library-unavailable", listener);
  });
});
