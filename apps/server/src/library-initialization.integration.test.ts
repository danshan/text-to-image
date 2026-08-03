import { access, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createArchiveAdapter } from "./shared/archive-adapter.js";
import { loadServerConfig } from "./shared/config.js";
import { resolveLibraryInitialization } from "./shared/library-initialization.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Library initialization", () => {
  it("resolves the Git root when npm starts the Server from its workspace", () => {
    const repositoryRoot = process.cwd();
    const config = loadServerConfig({}, join(repositoryRoot, "apps/server"));

    expect(config.gitRoot).toBe(repositoryRoot);
  });

  it("allows the real Archive adapter factory to resolve a missing default Library", async () => {
    const gitRoot = await mkdtemp(join(tmpdir(), "text-to-image-server-init-"));
    roots.push(gitRoot);

    const archive = createArchiveAdapter({ gitRoot });

    expect(archive.libraryRoot).toBe(join(await realpath(gitRoot), "library"));
    expect(archive.formatVersion).toBeNull();
    expect(archive.readOnly).toBe(true);
    expect(resolveLibraryInitialization(archive.libraryRoot)).not.toBeNull();
    await expect(access(archive.libraryRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("returns a shell-safe exact command without creating the configured path", async () => {
    const owner = await mkdtemp(join(tmpdir(), "text-to-image-server-init-"));
    roots.push(owner);
    const libraryRoot = join(owner, "artist's library");

    const initialization = resolveLibraryInitialization(libraryRoot);

    expect(initialization).toEqual({
      required: true,
      libraryRoot,
      initCommand: `npm run assetctl -- init --library '${libraryRoot.replaceAll("'", `'\\''`)}'`,
    });
    await expect(access(libraryRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("returns ready when the manifest already exists", async () => {
    const libraryRoot = await mkdtemp(join(tmpdir(), "text-to-image-server-init-"));
    roots.push(libraryRoot);
    await writeFile(join(libraryRoot, "library.json"), "{}\n");

    expect(resolveLibraryInitialization(libraryRoot)).toBeNull();
  });
});
