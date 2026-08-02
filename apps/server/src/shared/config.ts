import { resolve } from "node:path";

export interface ServerConfig {
  host: "127.0.0.1";
  port: number;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  gitRoot: string;
  libraryArgument?: string;
  devOrigin?: string;
}

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

export function loadServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const host = environment.TEXT_TO_IMAGE_HOST ?? "127.0.0.1";
  if (host !== "127.0.0.1") {
    throw new TypeError("TEXT_TO_IMAGE_HOST must be 127.0.0.1");
  }
  const logLevel = environment.TEXT_TO_IMAGE_LOG_LEVEL ?? "info";
  if (!logLevels.has(logLevel as ServerConfig["logLevel"])) {
    throw new TypeError("TEXT_TO_IMAGE_LOG_LEVEL is invalid");
  }
  const base: Pick<ServerConfig, "host" | "port" | "logLevel" | "gitRoot"> = {
    host,
    port: parsePort(environment.TEXT_TO_IMAGE_PORT),
    logLevel: logLevel as ServerConfig["logLevel"],
    gitRoot: resolve(environment.TEXT_TO_IMAGE_GIT_ROOT ?? process.cwd()),
  };
  const result: ServerConfig = environment.TEXT_TO_IMAGE_LIBRARY
    ? { ...base, libraryArgument: environment.TEXT_TO_IMAGE_LIBRARY }
    : base;
  if (environment.TEXT_TO_IMAGE_DEV_ORIGIN) {
    const origin = new URL(environment.TEXT_TO_IMAGE_DEV_ORIGIN);
    if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1") {
      throw new TypeError("TEXT_TO_IMAGE_DEV_ORIGIN must be an http://127.0.0.1 origin");
    }
    result.devOrigin = origin.origin;
  }
  return result;
}
