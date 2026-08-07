import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, parse, resolve } from "node:path";
import { ArchiveError } from "@text-to-image/domain";
import { writeJsonAtomic } from "./internal.js";

export interface LibraryResolutionOptions {
  cliPath?: string;
  gitRoot?: string;
  startDirectory?: string;
}

export interface ResolvedLibrary {
  gitRoot: string;
  libraryRoot: string;
  source: "cli" | "local_config" | "tracked_config" | "default";
}

export interface PersistedLibrarySelection {
  configPath: string;
  libraryRoot: string;
}

export interface ProviderConfiguration {
  enabled: boolean;
  defaultModel?: string;
  timeoutSeconds: number;
}

export interface ResolvedProviderConfiguration {
  gitRoot: string;
  providers: Record<"openai" | "xai", ProviderConfiguration>;
}

interface ProjectConfig {
  library?: string;
  providers?: Partial<Record<"openai" | "xai", Partial<ProviderConfiguration>>>;
}

export function findGitRoot(startDirectory = process.cwd()): string {
  let current = realpathSync(startDirectory);
  const filesystemRoot = parse(current).root;
  while (true) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }
    if (current === filesystemRoot) {
      throw new ArchiveError(
        "LIBRARY_CONFIG_INVALID",
        "Cannot resolve the Library because no Git root was found.",
        { startDirectory },
      );
    }
    current = dirname(current);
  }
}

export function resolveLibrary(options: LibraryResolutionOptions = {}): ResolvedLibrary {
  const gitRoot = realpathSync(
    options.gitRoot ?? findGitRoot(options.startDirectory ?? process.cwd()),
  );
  const localConfigPath = join(gitRoot, "text-to-image.local.json");
  const trackedConfigPath = join(gitRoot, "text-to-image.config.json");
  const localConfig = existsSync(localConfigPath) ? readProjectConfig(localConfigPath) : null;

  let configuredPath: string;
  let source: ResolvedLibrary["source"];
  if (options.cliPath) {
    configuredPath = options.cliPath;
    source = "cli";
  } else if (localConfig?.library) {
    configuredPath = localConfig.library;
    source = "local_config";
  } else if (existsSync(trackedConfigPath)) {
    configuredPath = readProjectConfig(trackedConfigPath).library ?? "./library";
    source = "tracked_config";
  } else {
    configuredPath = "./library";
    source = "default";
  }

  const absolutePath = isAbsolute(configuredPath)
    ? configuredPath
    : resolve(gitRoot, configuredPath);
  return {
    gitRoot,
    libraryRoot: canonicalizePossiblyMissing(absolutePath),
    source,
  };
}

export function canonicalizePossiblyMissing(path: string): string {
  const absolutePath = resolve(path);
  if (existsSync(absolutePath)) {
    return realpathSync(absolutePath);
  }

  const missingSegments: string[] = [];
  let existingAncestor = absolutePath;
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) {
      throw new ArchiveError("LIBRARY_NOT_FOUND", "Cannot canonicalize the Library root.");
    }
    missingSegments.unshift(basename(existingAncestor));
    existingAncestor = parent;
  }
  if (!lstatSync(existingAncestor).isDirectory()) {
    throw new ArchiveError("LIBRARY_CONFIG_INVALID", "Library path has a non-directory ancestor.", {
      ancestor: existingAncestor,
    });
  }
  return resolve(realpathSync(existingAncestor), ...missingSegments);
}

export function persistLibrarySelection(
  gitRootInput: string,
  libraryRootInput: string,
): PersistedLibrarySelection {
  const gitRoot = realpathSync(gitRootInput);
  const libraryRoot = realpathSync(libraryRootInput);
  const configPath = join(gitRoot, "text-to-image.local.json");
  const existing = existsSync(configPath) ? readProjectConfig(configPath) : {};
  writeJsonAtomic(configPath, { ...existing, library: libraryRoot });
  return { configPath, libraryRoot };
}

export function resolveProviderConfiguration(
  options: Pick<LibraryResolutionOptions, "gitRoot" | "startDirectory"> = {},
): ResolvedProviderConfiguration {
  const gitRoot = realpathSync(
    options.gitRoot ?? findGitRoot(options.startDirectory ?? process.cwd()),
  );
  const trackedPath = join(gitRoot, "text-to-image.config.json");
  const localPath = join(gitRoot, "text-to-image.local.json");
  const tracked = existsSync(trackedPath) ? readProjectConfig(trackedPath) : {};
  const local = existsSync(localPath) ? readProjectConfig(localPath) : {};
  const defaults: ResolvedProviderConfiguration["providers"] = {
    openai: { enabled: true, timeoutSeconds: 600 },
    xai: { enabled: false, timeoutSeconds: 600 },
  };
  return {
    gitRoot,
    providers: {
      openai: mergeProviderConfig(
        defaults.openai,
        tracked.providers?.openai,
        local.providers?.openai,
      ),
      xai: mergeProviderConfig(defaults.xai, tracked.providers?.xai, local.providers?.xai),
    },
  };
}

function readProjectConfig(path: string): ProjectConfig {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ArchiveError("LIBRARY_CONFIG_INVALID", "Library configuration is not valid JSON.", {
      configPath: path,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ArchiveError(
      "LIBRARY_CONFIG_INVALID",
      "Project configuration must be a JSON object.",
      { configPath: path },
    );
  }
  const record = value as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter((key) => key !== "library" && key !== "providers");
  if (unknownKeys.length > 0) {
    throw new ArchiveError("LIBRARY_CONFIG_INVALID", "Project configuration has unknown fields.", {
      configPath: path,
      fields: unknownKeys,
    });
  }
  if (record.library !== undefined && (typeof record.library !== "string" || !record.library)) {
    throw new ArchiveError(
      "LIBRARY_CONFIG_INVALID",
      "Library configuration must contain a non-empty library path.",
      { configPath: path },
    );
  }
  const providers = readProviderOverrides(record.providers, path);
  return {
    ...(typeof record.library === "string" ? { library: record.library } : {}),
    ...(providers ? { providers } : {}),
  };
}

function readProviderOverrides(
  value: unknown,
  path: string,
): ProjectConfig["providers"] | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ArchiveError("LIBRARY_CONFIG_INVALID", "Provider configuration must be an object.", {
      configPath: path,
    });
  }
  const record = value as Record<string, unknown>;
  const unknownProviders = Object.keys(record).filter(
    (provider) => provider !== "openai" && provider !== "xai",
  );
  if (unknownProviders.length > 0) {
    throw new ArchiveError("LIBRARY_CONFIG_INVALID", "Provider configuration is not registered.", {
      configPath: path,
      providers: unknownProviders,
    });
  }
  return Object.fromEntries(
    Object.entries(record).map(([provider, config]) => [
      provider,
      readProviderOverride(config, path),
    ]),
  );
}

function readProviderOverride(value: unknown, path: string): Partial<ProviderConfiguration> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ArchiveError("LIBRARY_CONFIG_INVALID", "Provider override must be an object.", {
      configPath: path,
    });
  }
  const record = value as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter(
    (key) => key !== "enabled" && key !== "defaultModel" && key !== "timeoutSeconds",
  );
  if (unknownKeys.length > 0) {
    throw new ArchiveError("LIBRARY_CONFIG_INVALID", "Provider override has unknown fields.", {
      configPath: path,
      fields: unknownKeys,
    });
  }
  if (record.enabled !== undefined && typeof record.enabled !== "boolean") {
    throw new ArchiveError("LIBRARY_CONFIG_INVALID", "Provider enabled must be boolean.");
  }
  if (
    record.defaultModel !== undefined &&
    (typeof record.defaultModel !== "string" || !record.defaultModel.trim())
  ) {
    throw new ArchiveError("LIBRARY_CONFIG_INVALID", "Provider defaultModel must be non-empty.");
  }
  if (
    record.timeoutSeconds !== undefined &&
    (!Number.isInteger(record.timeoutSeconds) ||
      (record.timeoutSeconds as number) < 60 ||
      (record.timeoutSeconds as number) > 1800)
  ) {
    throw new ArchiveError(
      "LIBRARY_CONFIG_INVALID",
      "Provider timeoutSeconds must be between 60 and 1800.",
    );
  }
  return {
    ...(typeof record.enabled === "boolean" ? { enabled: record.enabled } : {}),
    ...(typeof record.defaultModel === "string" ? { defaultModel: record.defaultModel } : {}),
    ...(typeof record.timeoutSeconds === "number" ? { timeoutSeconds: record.timeoutSeconds } : {}),
  };
}

function mergeProviderConfig(
  defaults: ProviderConfiguration,
  tracked?: Partial<ProviderConfiguration>,
  local?: Partial<ProviderConfiguration>,
): ProviderConfiguration {
  return { ...defaults, ...tracked, ...local };
}
