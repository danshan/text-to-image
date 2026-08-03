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

  let configuredPath: string;
  let source: ResolvedLibrary["source"];
  if (options.cliPath) {
    configuredPath = options.cliPath;
    source = "cli";
  } else if (existsSync(localConfigPath)) {
    configuredPath = readLibraryConfig(localConfigPath);
    source = "local_config";
  } else if (existsSync(trackedConfigPath)) {
    configuredPath = readLibraryConfig(trackedConfigPath);
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
  writeJsonAtomic(configPath, { library: libraryRoot });
  return { configPath, libraryRoot };
}

function readLibraryConfig(path: string): string {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ArchiveError("LIBRARY_CONFIG_INVALID", "Library configuration is not valid JSON.", {
      configPath: path,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as Record<string, unknown>).library !== "string" ||
    !(value as Record<string, unknown>).library
  ) {
    throw new ArchiveError(
      "LIBRARY_CONFIG_INVALID",
      "Library configuration must contain a non-empty library path.",
      { configPath: path },
    );
  }
  return (value as { library: string }).library;
}
