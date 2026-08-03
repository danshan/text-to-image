import { existsSync } from "node:fs";
import { join } from "node:path";
import type { LibraryInitializationRequired } from "@text-to-image/api-contract";

export function resolveLibraryInitialization(
  libraryRoot: string,
): LibraryInitializationRequired | null {
  if (existsSync(join(libraryRoot, "library.json"))) return null;
  return {
    required: true,
    libraryRoot,
    initCommand: `npm run assetctl -- init --library ${quoteShellArgument(libraryRoot)}`,
  };
}

function quoteShellArgument(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
