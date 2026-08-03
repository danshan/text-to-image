import { access, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initLibrary } from "@text-to-image/archive";
import { afterEach, describe, expect, it } from "vitest";
import { loadServerConfig } from "./shared/config.js";
import { LibraryRuntime } from "./shared/library-runtime.js";

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

  it("represents a missing default Library without creating it", async () => {
    const gitRoot = await mkdtemp(join(tmpdir(), "text-to-image-server-init-"));
    roots.push(gitRoot);

    const runtime = await LibraryRuntime.create({ gitRoot });
    const libraryRoot = join(await realpath(gitRoot), "library");

    expect(runtime.state).toEqual({
      status: "unavailable",
      libraryRoot,
      reason: "missing_root",
      allowedActions: ["initialize", "select", "retry"],
    });
    await expect(access(libraryRoot)).rejects.toMatchObject({ code: "ENOENT" });
    runtime.close();
  });

  it("initializes, persists and hot-switches a missing Library", async () => {
    const owner = await mkdtemp(join(tmpdir(), "text-to-image-server-init-"));
    roots.push(owner);
    const libraryRoot = join(owner, "artist's library");
    const runtime = await LibraryRuntime.create({ gitRoot: owner, libraryArgument: libraryRoot });

    const started = runtime.startTransition("initialize", libraryRoot);
    let transition = runtime.transition;
    for (let attempt = 0; attempt < 100 && transition?.stage === "preparing"; attempt += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
      transition = runtime.transition;
    }
    expect(transition).toMatchObject({ id: started.id, stage: "ready" });
    await runtime.commitTransition(started.id);

    expect(runtime.state).toEqual({ status: "ready", libraryRoot: await realpath(libraryRoot) });
    const persisted = JSON.parse(
      await readFile(join(owner, "text-to-image.local.json"), "utf8"),
    ) as { library: string };
    expect(persisted.library).toBe(await realpath(libraryRoot));
    runtime.close();
  });

  it("detects a deleted active Library at the next request boundary", async () => {
    const gitRoot = await mkdtemp(join(tmpdir(), "text-to-image-server-init-"));
    roots.push(gitRoot);
    const libraryRoot = join(gitRoot, "library");
    const canonicalLibraryRoot = join(await realpath(gitRoot), "library");
    initLibrary(libraryRoot);
    const runtime = await LibraryRuntime.create({ gitRoot, libraryArgument: libraryRoot });

    await rm(libraryRoot, { recursive: true });

    await expect(runtime.acquire()).rejects.toMatchObject({ code: "LIBRARY_UNAVAILABLE" });
    expect(runtime.state).toMatchObject({
      status: "unavailable",
      libraryRoot: canonicalLibraryRoot,
      reason: "missing_root",
    });
    runtime.close();
  });
});
