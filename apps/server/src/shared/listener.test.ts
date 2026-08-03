import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { resolveListenerUrls, type NetworkInterfaces } from "./listener.js";

function networkAddress(
  address: string,
  family: "IPv4" | "IPv6",
  internal = false,
  scopeid = 0,
): NetworkInterfaceInfo {
  const common = {
    address,
    internal,
    mac: "00:00:00:00:00:00",
    netmask: family === "IPv4" ? "255.255.255.0" : "ffff:ffff:ffff:ffff::",
    cidr: null,
  };
  return family === "IPv4" ? { ...common, family } : { ...common, family, scopeid };
}

const interfaces: NetworkInterfaces = {
  en0: [
    networkAddress("192.168.1.10", "IPv4"),
    networkAddress("fd00::10", "IPv6"),
    networkAddress("fe80::10", "IPv6", false, 11),
  ],
  lo0: [networkAddress("127.0.0.1", "IPv4", true), networkAddress("::1", "IPv6", true)],
};

describe("Listener URL discovery", () => {
  it("uses a concrete IP directly", () => {
    expect(resolveListenerUrls("192.168.1.10", 4173, interfaces)).toEqual([
      "http://192.168.1.10:4173",
    ]);
  });

  it("enumerates IPv4 interfaces for 0.0.0.0", () => {
    expect(resolveListenerUrls("0.0.0.0", 4173, interfaces)).toEqual([
      "http://127.0.0.1:4173",
      "http://192.168.1.10:4173",
    ]);
  });

  it("enumerates unscoped IPv6 interfaces for :: and brackets their URLs", () => {
    expect(resolveListenerUrls("::", 4173, interfaces)).toEqual([
      "http://[::1]:4173",
      "http://[fd00::10]:4173",
    ]);
  });

  it("fails when a wildcard has no matching interface", () => {
    expect(() => resolveListenerUrls("::", 4173, { en0: interfaces.en0?.slice(0, 1) })).toThrow(
      /No active IPv6 interfaces/u,
    );
  });
});
