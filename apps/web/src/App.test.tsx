import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App first-run setup", () => {
  it("shows the resolved Library path and exact initialization command", async () => {
    window.history.replaceState({}, "", "/gallery");
    const initCommand = "npm run assetctl -- init --library '/tmp/image library'";
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        apiVersion: "v1",
        libraryFormatVersion: null,
        sessionToken: "session-secret",
        initialization: {
          required: true,
          libraryRoot: "/tmp/image library",
          initCommand,
        },
        capabilities: { curation: false, recovery: false, generationFromWeb: false },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Initialize the local Library" }),
    ).toBeTruthy();
    expect(screen.getByText("/tmp/image library")).toBeTruthy();
    expect(screen.getByText(initCommand)).toBeTruthy();
    expect(screen.getByText(/restart the local service/u)).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
