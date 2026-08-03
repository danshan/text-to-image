import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App Library unavailable state", () => {
  it("opens Library management without requesting Gallery", async () => {
    window.history.replaceState({}, "", "/gallery");
    const fetcher = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/v1/bootstrap") {
        return Promise.resolve(
          Response.json({
            apiVersion: "v1",
            libraryFormatVersion: null,
            sessionToken: "session-secret",
            library: {
              status: "unavailable",
              libraryRoot: "/tmp/image library",
              reason: "missing_root",
              allowedActions: ["initialize", "select", "retry"],
            },
            capabilities: {
              curation: false,
              recovery: false,
              libraryManagement: true,
              generationFromWeb: false,
            },
          }),
        );
      }
      if (url === "/api/v1/health") {
        return Promise.resolve(
          Response.json({
            status: "unavailable",
            apiVersion: "v1",
            libraryFormatVersion: null,
            index: {
              available: false,
              latestArchiveMarker: null,
              lastIndexedMarker: null,
              lagCount: 0,
            },
            recoveryCount: 0,
            diagnostics: ["Asset Library is unavailable."],
          }),
        );
      }
      if (url === "/api/v1/library/transition") {
        return Promise.resolve(Response.json({ data: null }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Initialize or switch Library" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Library path")).toHaveProperty("value", "/tmp/image library");
    expect(screen.queryByText("Directory browser path")).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => String(url).startsWith("/api/v1/gallery"))).toBe(
      false,
    );
  });
});
