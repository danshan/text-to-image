import { isIP } from "node:net";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

export type NetworkInterfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;

function formatUrl(address: string, port: number): string {
  const host = isIP(address) === 6 ? `[${address}]` : address;
  return `http://${host}:${port}`;
}

function wildcardFamily(host: string): 4 | 6 | null {
  if (host === "0.0.0.0") return 4;
  if (host === "::") return 6;
  return null;
}

export function resolveListenerUrls(
  host: string,
  port: number,
  interfaces: NetworkInterfaces = networkInterfaces(),
): string[] {
  const family = wildcardFamily(host);
  if (family === null) return [formatUrl(host, port)];

  const addresses = new Set<string>();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv6" && entry.scopeid !== 0) continue;
      if (isIP(entry.address) === family) addresses.add(entry.address);
    }
  }
  if (addresses.size === 0) {
    throw new TypeError(`No active IPv${family} interfaces are available for ${host}`);
  }
  return [...addresses].sort().map((address) => formatUrl(address, port));
}
