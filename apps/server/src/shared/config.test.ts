import { describe, expect, it } from "vitest";
import { loadServerConfig, resolveListenHost } from "./config.js";

describe("Server listen host configuration", () => {
  it("uses CLI, environment and loopback precedence", () => {
    expect(resolveListenHost(["--host", "192.168.1.10"], "10.0.0.5")).toBe("192.168.1.10");
    expect(resolveListenHost([], "10.0.0.5")).toBe("10.0.0.5");
    expect(resolveListenHost([])).toBe("127.0.0.1");
  });

  it("accepts IPv4 and IPv6 wildcard hosts", () => {
    expect(resolveListenHost(["--host=0.0.0.0"])).toBe("0.0.0.0");
    expect(resolveListenHost(["--host", "::"])).toBe("::");
  });

  it("rejects hostnames, missing values, duplicates and unknown options", () => {
    expect(() => resolveListenHost(["--host", "localhost"])).toThrow(/IPv4 or IPv6/u);
    expect(() => resolveListenHost(["--host"])).toThrow(/requires an IP/u);
    expect(() => resolveListenHost(["--host=127.0.0.1", "--host", "::1"])).toThrow(
      /only be specified once/u,
    );
    expect(() => resolveListenHost(["--port", "4000"])).toThrow(/Unknown Server option/u);
  });

  it("loads development listener metadata without changing the Fastify bind host", () => {
    const config = loadServerConfig(
      {
        TEXT_TO_IMAGE_HOST: "0.0.0.0",
        TEXT_TO_IMAGE_DEV_HOST: "::",
        TEXT_TO_IMAGE_DEV_PORT: "5173",
      },
      process.cwd(),
      ["--host", "127.0.0.2"],
    );

    expect(config.host).toBe("127.0.0.2");
    expect(config.devHost).toBe("::");
    expect(config.devPort).toBe(5173);
  });

  it("accepts an explicit IPv6 development Origin", () => {
    expect(loadServerConfig({ TEXT_TO_IMAGE_DEV_ORIGIN: "http://[::1]:5173" }).devOrigin).toBe(
      "http://[::1]:5173",
    );
  });
});
