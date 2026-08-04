import { describe, expect, it } from "vitest";
import { parseDaemonMetadata } from "../../scripts/daemon.mjs";

describe("daemon metadata", () => {
  it("accepts the bounded runtime metadata contract", () => {
    const metadata = {
      version: 1,
      pid: 42,
      instanceId: "0123456789abcdef",
      startedAt: "2026-08-04T00:00:00.000Z",
      urls: ["http://127.0.0.1:4173"],
      logPath: "/tmp/text-to-image/server.log",
    };

    expect(parseDaemonMetadata(JSON.stringify(metadata))).toEqual(metadata);
  });

  it.each([
    { pid: 0 },
    { instanceId: "not-an-instance" },
    { urls: ["https://127.0.0.1:4173"] },
    { urls: [] },
    { startedAt: "invalid" },
  ])("rejects invalid metadata: %o", (override) => {
    expect(
      parseDaemonMetadata(
        JSON.stringify({
          version: 1,
          pid: 42,
          instanceId: "0123456789abcdef",
          startedAt: "2026-08-04T00:00:00.000Z",
          urls: ["http://127.0.0.1:4173"],
          logPath: "/tmp/text-to-image/server.log",
          ...override,
        }),
      ),
    ).toBeUndefined();
  });
});
