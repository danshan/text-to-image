import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { cpus, platform, release, tmpdir, totalmem } from "node:os";
import { basename, dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ReadModel } from "@text-to-image/read-model";

interface Scale {
  creations: number;
  generations: number;
  images: number;
  maximumRebuildMilliseconds: number;
}

interface MarkerRecord {
  kind: string;
  path: string;
  sha256: string;
}

const releaseScale = process.env.TEXT_TO_IMAGE_PERF_SCALE === "release";
const scale: Scale = releaseScale
  ? { creations: 2_000, generations: 30_000, images: 10_000, maximumRebuildMilliseconds: 60_000 }
  : { creations: 40, generations: 600, images: 200, maximumRebuildMilliseconds: 10_000 };
const createdAt = "2026-01-01T00:00:00.000Z";

let libraryRoot = "";
let readModel: ReadModel;
let rebuildMilliseconds = 0;

describe(`read-model ${releaseScale ? "release" : "smoke"} performance baseline`, () => {
  beforeAll(async () => {
    libraryRoot = await mkdtemp(join(tmpdir(), "text-to-image-performance-"));
    await buildSyntheticLibrary(libraryRoot, scale);

    readModel = new ReadModel(libraryRoot);
    const startedAt = performance.now();
    await readModel.open();
    rebuildMilliseconds = performance.now() - startedAt;
  });

  afterAll(async () => {
    readModel?.close();
    if (!libraryRoot || !basename(libraryRoot).startsWith("text-to-image-performance-")) {
      throw new TypeError("Refusing to clean an unexpected performance Library path");
    }
    const metadata = await lstat(libraryRoot);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new TypeError("Refusing to clean a non-directory performance Library path");
    }
    await rm(libraryRoot, { recursive: true });
  });

  test("rebuilds the filesystem archive within the baseline", () => {
    expect(rebuildMilliseconds).toBeLessThanOrEqual(scale.maximumRebuildMilliseconds);
    expect(readModel.listCreations()).toHaveLength(scale.creations);
    expect(readModel.listGallery({ source: "all", limit: 1 }).total).toBe(scale.images);
  });

  test("keeps warm gallery and full-text queries below 200 ms p95", () => {
    const durations: number[] = [];
    for (let index = 0; index < 100; index += 1) {
      const startedAt = performance.now();
      const result = readModel.listGallery({
        q: "editorial",
        source: "all",
        sort: index % 2 === 0 ? "newest" : "oldest",
        limit: 40,
      });
      durations.push(performance.now() - startedAt);
      expect(result.total).toBe(scale.images);
    }

    durations.sort((left, right) => left - right);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    console.info("Performance baseline", {
      scale,
      datasetSeed: 0,
      rebuildMilliseconds: Math.round(rebuildMilliseconds),
      warmQueryP95Milliseconds: Math.round(p95 * 100) / 100,
      runtime: process.version,
      platform: `${platform()} ${release()}`,
      cpu: cpus()[0]?.model ?? "unknown",
      logicalCpuCount: cpus().length,
      memoryBytes: totalmem(),
    });
    expect(p95).toBeLessThanOrEqual(200);
  });
});

async function buildSyntheticLibrary(root: string, selectedScale: Scale): Promise<void> {
  const records: MarkerRecord[] = [];
  const writes: Array<Promise<void>> = [];
  const flushWrites = async () => {
    await Promise.all(writes.splice(0));
  };
  const scheduleWrite = async (relativePath: string, content: string | Buffer, kind: string) => {
    const absolutePath = join(root, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    const bytes = typeof content === "string" ? Buffer.from(content) : content;
    writes.push(writeFile(absolutePath, bytes));
    records.push({ kind, path: relativePath, sha256: digest(bytes) });
    if (writes.length >= 256) await flushWrites();
  };

  await mkdir(join(root, "archive", "commits"), { recursive: true });
  await mkdir(join(root, "curation", "creations"), { recursive: true });
  await writeFile(
    join(root, "library.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "performance-library",
      name: "Performance Library",
      createdAt,
    }),
  );

  for (let index = 0; index < selectedScale.images; index += 1) {
    const bytes = Buffer.from(`performance-image-${index}`);
    const assetSha256 = digest(bytes);
    await scheduleWrite(
      `assets/sha256/${assetSha256.slice(0, 2)}/${assetSha256}.png`,
      bytes,
      "image_asset",
    );
  }

  for (let index = 0; index < selectedScale.creations; index += 1) {
    const creationId = sequenceId("creation", index);
    const revisionId = sequenceId("revision", index);
    const prompt = `Editorial subject ${index} with controlled composition and palette.`;
    const creation = JSON.stringify({ id: creationId, createdAt });
    const revision = JSON.stringify({
      id: revisionId,
      creationId,
      parentRevisionId: null,
      changeInstruction: "Establish the synthetic performance baseline.",
      promptSha256: digest(Buffer.from(prompt)),
      createdAt,
    });
    const curation = JSON.stringify({
      creationId,
      title: `Editorial Creation ${index}`,
      status: "active",
      tags: ["editorial", `group-${index % 20}`],
      favorite: index % 10 === 0,
      note: "Synthetic performance record.",
      entityRevision: 1,
    });

    await scheduleWrite(`creations/${creationId}/creation.json`, creation, "creation");
    await scheduleWrite(
      `creations/${creationId}/revisions/${revisionId}/revision.json`,
      revision,
      "revision",
    );
    await scheduleWrite(
      `creations/${creationId}/revisions/${revisionId}/prompt.md`,
      prompt,
      "prompt",
    );
    writes.push(writeFile(join(root, "curation", "creations", `${creationId}.json`), curation));
    if (writes.length >= 256) await flushWrites();
  }

  for (let index = 0; index < selectedScale.generations; index += 1) {
    const creationIndex = index % selectedScale.creations;
    const imageIndex = index % selectedScale.images;
    const creationId = sequenceId("creation", creationIndex);
    const generationId = sequenceId("generation", index);
    const revisionId = sequenceId("revision", creationIndex);
    const imageBytes = Buffer.from(`performance-image-${imageIndex}`);
    const assetSha256 = digest(imageBytes);
    const generation = JSON.stringify({
      id: generationId,
      creationId,
      promptRevisionId: revisionId,
      replayOfGenerationId: null,
      status: "succeeded",
      outcomeKnown: true,
      references: [{ assetSha256, roles: ["composition"], guidance: "Reuse the framing only." }],
      outputs: [{ index: 0, assetSha256, mediaType: "image/png", width: 1024, height: 1024 }],
      tool: { name: "performance.fixture", model: "deterministic-v1", parameters: { seed: index } },
      startedAt: createdAt,
      completedAt: createdAt,
      error: null,
    });
    await scheduleWrite(
      `creations/${creationId}/generations/${generationId}/generation.json`,
      generation,
      "generation",
    );
  }
  await flushWrites();

  const markerId = "20260101T000000000Z-performance";
  const marker = JSON.stringify({ id: markerId, createdAt, records });
  await writeFile(join(root, "archive", "commits", `${markerId}.json`), marker);
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sequenceId(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(8, "0")}`;
}
