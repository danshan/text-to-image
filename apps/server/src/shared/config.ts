import { resolve } from "node:path";
import { isIP } from "node:net";
import { findGitRoot } from "@text-to-image/archive";

export interface ServerConfig {
  host: string;
  port: number;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  gitRoot: string;
  libraryArgument?: string;
  devOrigin?: string;
  devHost?: string;
  devPort?: number;
}

export const DEFAULT_LISTEN_HOST = "127.0.0.1";

const logLevels = new Set<ServerConfig["logLevel"]>([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
]);

function parsePort(raw: string | undefined): number {
  const value = raw === undefined ? 0 : Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 65_535) {
    throw new TypeError("TEXT_TO_IMAGE_PORT must be an integer between 0 and 65535");
  }
  return value;
}

function parseIpLiteral(raw: string, source: string): string {
  if (isIP(raw) === 0) {
    throw new TypeError(`${source} must be an IPv4 or IPv6 address`);
  }
  return raw;
}

function parseUrlIpLiteral(hostname: string, source: string): string {
  const unwrapped =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  return parseIpLiteral(unwrapped, source);
}

export function resolveListenHost(argv: readonly string[], environmentHost?: string): string {
  let argumentHost: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--host") {
      if (argumentHost !== undefined) throw new TypeError("--host may only be specified once");
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new TypeError("--host requires an IP address");
      argumentHost = value;
      index += 1;
      continue;
    }
    if (argument?.startsWith("--host=")) {
      if (argumentHost !== undefined) throw new TypeError("--host may only be specified once");
      argumentHost = argument.slice("--host=".length);
      if (!argumentHost) throw new TypeError("--host requires an IP address");
      continue;
    }
    throw new TypeError(`Unknown Server option: ${argument ?? ""}`);
  }

  if (argumentHost !== undefined) return parseIpLiteral(argumentHost, "--host");
  if (environmentHost !== undefined) {
    return parseIpLiteral(environmentHost, "TEXT_TO_IMAGE_HOST");
  }
  return DEFAULT_LISTEN_HOST;
}

export function loadServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
  startDirectory = process.cwd(),
  argv: readonly string[] = [],
): ServerConfig {
  const host = resolveListenHost(argv, environment.TEXT_TO_IMAGE_HOST);
  const logLevel = environment.TEXT_TO_IMAGE_LOG_LEVEL ?? "info";
  if (!logLevels.has(logLevel as ServerConfig["logLevel"])) {
    throw new TypeError("TEXT_TO_IMAGE_LOG_LEVEL is invalid");
  }
  const base: Pick<ServerConfig, "host" | "port" | "logLevel" | "gitRoot"> = {
    host,
    port: parsePort(environment.TEXT_TO_IMAGE_PORT),
    logLevel: logLevel as ServerConfig["logLevel"],
    gitRoot: environment.TEXT_TO_IMAGE_GIT_ROOT
      ? resolve(startDirectory, environment.TEXT_TO_IMAGE_GIT_ROOT)
      : findGitRoot(startDirectory),
  };
  const result: ServerConfig = environment.TEXT_TO_IMAGE_LIBRARY
    ? { ...base, libraryArgument: environment.TEXT_TO_IMAGE_LIBRARY }
    : base;
  if (environment.TEXT_TO_IMAGE_DEV_ORIGIN) {
    const origin = new URL(environment.TEXT_TO_IMAGE_DEV_ORIGIN);
    if (origin.protocol !== "http:") {
      throw new TypeError("TEXT_TO_IMAGE_DEV_ORIGIN must use http and an IP literal");
    }
    parseUrlIpLiteral(origin.hostname, "TEXT_TO_IMAGE_DEV_ORIGIN");
    result.devOrigin = origin.origin;
  }
  if (environment.TEXT_TO_IMAGE_DEV_PORT !== undefined) {
    const devPort = parsePort(environment.TEXT_TO_IMAGE_DEV_PORT);
    if (devPort === 0) throw new TypeError("TEXT_TO_IMAGE_DEV_PORT must be between 1 and 65535");
    result.devPort = devPort;
    result.devHost = resolveListenHost([], environment.TEXT_TO_IMAGE_DEV_HOST);
  }
  return result;
}
