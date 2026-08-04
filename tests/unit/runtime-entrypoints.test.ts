import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("runtime entrypoints", () => {
  it("keeps npm as the authoritative mise task boundary", async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.dev).toContain("--env-file-if-exists=.env");
    expect(packageJson.scripts.start).toContain("--env-file-if-exists=.env");
    expect(packageJson.scripts.daemon).toBe("node --import tsx scripts/daemon.mts start");
  });

  it("loads an optional env file without overriding the shell environment", async () => {
    const root = await mkdtemp(join(tmpdir(), "text-to-image-env-test-"));
    const envPath = join(root, ".env");
    await writeFile(envPath, "TEXT_TO_IMAGE_TEST_VALUE=from-file\n");
    try {
      const loaded = spawnSync(
        process.execPath,
        [
          `--env-file-if-exists=${envPath}`,
          "-e",
          "process.stdout.write(process.env.TEXT_TO_IMAGE_TEST_VALUE ?? 'missing')",
        ],
        { encoding: "utf8" },
      );
      expect(loaded.status, loaded.stderr).toBe(0);
      expect(loaded.stdout).toBe("from-file");

      const overridden = spawnSync(
        process.execPath,
        [
          `--env-file-if-exists=${envPath}`,
          "-e",
          "process.stdout.write(process.env.TEXT_TO_IMAGE_TEST_VALUE ?? 'missing')",
        ],
        {
          encoding: "utf8",
          env: { ...process.env, TEXT_TO_IMAGE_TEST_VALUE: "from-shell" },
        },
      );
      expect(overridden.status, overridden.stderr).toBe(0);
      expect(overridden.stdout).toBe("from-shell");

      const missing = spawnSync(
        process.execPath,
        [
          `--env-file-if-exists=${join(root, "missing.env")}`,
          "-e",
          "process.stdout.write('loaded')",
        ],
        { encoding: "utf8" },
      );
      expect(missing.status, missing.stderr).toBe(0);
      expect(missing.stdout).toBe("loaded");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
