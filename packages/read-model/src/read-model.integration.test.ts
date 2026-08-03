import { createHash } from "node:crypto";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ReadModel } from "./read-model.js";

const creationId = "f69e912d-c504-4278-89d5-4558ba452df0";
const revisionId = "1567f72f-7a13-45cd-acd3-84a0090547e1";
const generationId = "755fc2f9-81a8-4d3a-89c4-3d60ca2ed21d";
const failedGenerationId = "8b2e66e9-08db-41cb-8a1c-5b2a66859317";
const recoveryGenerationId = "93482f51-5ee0-4f38-9dcb-4d17c1e0db4c";
const markerId = "9f386ef3-b8ce-4197-ad14-a2fda4c19754";
const failedMarkerId = "a4d6c7e8-f901-4234-8567-9a0b1c2d3e4f";
const recoveryMarkerId = "b5e7d8f9-0123-4345-9678-ab1c2d3e4f50";

const roots: string[] = [];

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writeObject(
  root: string,
  path: string,
  content: string | Uint8Array,
): Promise<{ kind: string; path: string; sha256: string }> {
  const absolute = join(root, ...path.split("/"));
  await mkdir(join(absolute, ".."), { recursive: true });
  await writeFile(absolute, content);
  const kind = path.endsWith("creation.json")
    ? "creation"
    : path.endsWith("revision.json")
      ? "revision"
      : path.endsWith("prompt.md")
        ? "prompt"
        : path.endsWith("generation.json")
          ? "generation"
          : "image_asset";
  return { kind, path, sha256: digest(content) };
}

async function fixture(): Promise<{ root: string; assetSha256: string }> {
  const root = await mkdtemp(join(tmpdir(), "text-to-image-read-model-"));
  roots.push(root);
  await writeFile(
    join(root, "library.json"),
    json({
      schemaVersion: 1,
      formatVersion: 1,
      libraryId: "2d90beba-cf0d-4f6b-bfe6-4e285d7d0120",
      createdAt: "2026-08-02T12:00:00.000Z",
      hashAlgorithm: "sha256",
    }),
  );
  for (const directory of ["archive/commits", "curation/creations", "curation/images", ".cache"]) {
    await mkdir(join(root, ...directory.split("/")), { recursive: true });
  }

  const imageBytes = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const assetSha256 = digest(imageBytes);
  const prompt = "A quiet portrait with soft side lighting.\n";
  const creation = json({
    schemaVersion: 1,
    id: creationId,
    createdAt: "2026-08-02T12:01:00.000Z",
  });
  const revision = json({
    schemaVersion: 1,
    id: revisionId,
    creationId,
    parentRevisionId: null,
    changeInstruction: "Use soft side lighting.",
    promptSha256: digest(prompt),
    createdAt: "2026-08-02T12:02:00.000Z",
  });
  const generation = json({
    schemaVersion: 1,
    id: generationId,
    creationId,
    promptRevisionId: revisionId,
    replayOfGenerationId: null,
    status: "succeeded",
    outcomeKnown: true,
    references: [],
    outputs: [{ index: 0, assetSha256, mediaType: "image/png", width: 1536, height: 1024 }],
    tool: { name: "image_gen.imagegen", model: null, parameters: {} },
    startedAt: "2026-08-02T12:02:05.000Z",
    completedAt: "2026-08-02T12:03:00.000Z",
    error: null,
  });

  const records = [
    await writeObject(root, `creations/${creationId}/creation.json`, creation),
    await writeObject(root, `creations/${creationId}/revisions/${revisionId}/prompt.md`, prompt),
    await writeObject(
      root,
      `creations/${creationId}/revisions/${revisionId}/revision.json`,
      revision,
    ),
    await writeObject(
      root,
      `creations/${creationId}/generations/${generationId}/generation.json`,
      generation,
    ),
    await writeObject(
      root,
      `assets/sha256/${assetSha256.slice(0, 2)}/${assetSha256}.png`,
      imageBytes,
    ),
  ];
  const marker = json({
    schemaVersion: 1,
    id: markerId,
    operation: "generation",
    createdAt: "2026-08-02T12:03:01.000Z",
    records,
  });
  await writeFile(join(root, "archive", "commits", `${markerId}.json`), marker);
  await mkdir(join(root, "creations", creationId), { recursive: true });
  await writeFile(join(root, "creations", creationId, "prompt-draft.md"), prompt);
  await writeFile(
    join(root, "creations", creationId, "prompt-draft.json"),
    json({
      schemaVersion: 1,
      basedOnRevisionId: revisionId,
      observedContentSha256: digest(prompt),
      updatedAt: "2026-08-02T12:04:00.000Z",
    }),
  );
  await writeFile(
    join(root, "curation", "creations", `${creationId}.json`),
    json({
      schemaVersion: 1,
      entityRevision: 1,
      creationId,
      title: "Soft Light Portrait",
      status: "active",
      tags: ["portrait"],
      favorite: true,
      note: "Warm palette next.",
      updatedAt: "2026-08-02T12:05:00.000Z",
    }),
  );
  await writeFile(
    join(root, "curation", "images", `${assetSha256}.json`),
    json({
      schemaVersion: 1,
      entityRevision: 2,
      assetSha256,
      tags: ["candidate"],
      favorite: true,
      rating: 4,
      hidden: false,
      note: "Strong composition.",
      updatedAt: "2026-08-02T12:06:00.000Z",
    }),
  );
  return { root, assetSha256 };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    expect(basename(root)).toMatch(/^text-to-image-read-model-/u);
    await rm(root, { recursive: true });
  }
});

describe("ReadModel", () => {
  it("does not create the Library root or cache when the manifest is missing", async () => {
    const owner = await mkdtemp(join(tmpdir(), "text-to-image-read-model-missing-"));
    roots.push(owner);
    const root = join(owner, "library");
    const model = new ReadModel(root);

    await expect(model.open()).rejects.toThrow("Library manifest does not exist");
    await expect(model.rebuild()).rejects.toThrow("Library manifest does not exist");
    await expect(access(root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rebuilds gallery and provenance from committed records", async () => {
    const { root, assetSha256 } = await fixture();
    const model = new ReadModel(root);
    await model.open();

    const gallery = model.listGallery({ q: "soft lighting", limit: 10 });
    expect(gallery.total).toBe(1);
    expect(gallery.items[0]).toMatchObject({
      sha256: assetSha256,
      creationTitle: "Soft Light Portrait",
      imported: false,
      rating: 4,
      entityRevision: 2,
    });
    expect(model.getGeneration(generationId)?.outputs[0]?.assetSha256).toBe(assetSha256);
    expect(model.getRevisions(creationId)[0]?.prompt).toContain("quiet portrait");
    expect(await model.status()).toMatchObject({
      available: true,
      lagCount: 0,
      lastIndexedMarker: markerId,
    });
    model.close();
  });

  it("derives one latest issue per active Creation and clears it after recovery", async () => {
    const { root } = await fixture();
    const failed = json({
      schemaVersion: 1,
      id: failedGenerationId,
      creationId,
      promptRevisionId: revisionId,
      replayOfGenerationId: null,
      status: "failed",
      outcomeKnown: true,
      references: [],
      outputs: [],
      tool: { name: "image_gen.imagegen", model: null, parameters: {} },
      startedAt: "2026-08-02T12:07:00.000Z",
      completedAt: "2026-08-02T12:08:00.000Z",
      error: {
        code: "IMAGE_GENERATION_SAFETY_REJECTED",
        summary: "The generated result was rejected by safety moderation.",
        retryable: false,
        moderation: { stage: "output", categories: ["sexual"] },
      },
    });
    const failedRecord = await writeObject(
      root,
      `creations/${creationId}/generations/${failedGenerationId}/generation.json`,
      failed,
    );
    await writeFile(
      join(root, "archive", "commits", `${failedMarkerId}.json`),
      json({
        schemaVersion: 1,
        id: failedMarkerId,
        operation: "generation",
        createdAt: "2026-08-02T12:08:01.000Z",
        records: [failedRecord],
      }),
    );

    const model = new ReadModel(root);
    await model.open();
    expect(model.listGenerationIssues()).toEqual([
      {
        generationId: failedGenerationId,
        creationId,
        creationTitle: "Soft Light Portrait",
        status: "failed",
        outcomeKnown: true,
        completedAt: "2026-08-02T12:08:00.000Z",
        error: {
          code: "IMAGE_GENERATION_SAFETY_REJECTED",
          summary: "The generated result was rejected by safety moderation.",
          retryable: false,
          moderation: { stage: "output", categories: ["sexual"] },
        },
      },
    ]);

    const recovered = json({
      schemaVersion: 1,
      id: recoveryGenerationId,
      creationId,
      promptRevisionId: revisionId,
      replayOfGenerationId: null,
      status: "succeeded",
      outcomeKnown: true,
      references: [],
      outputs: [],
      tool: { name: "image_gen.imagegen", model: null, parameters: {} },
      startedAt: "2026-08-02T12:09:00.000Z",
      completedAt: "2026-08-02T12:10:00.000Z",
      error: null,
    });
    const recoveredRecord = await writeObject(
      root,
      `creations/${creationId}/generations/${recoveryGenerationId}/generation.json`,
      recovered,
    );
    await writeFile(
      join(root, "archive", "commits", `${recoveryMarkerId}.json`),
      json({
        schemaVersion: 1,
        id: recoveryMarkerId,
        operation: "generation",
        createdAt: "2026-08-02T12:10:01.000Z",
        records: [recoveredRecord],
      }),
    );
    await model.rebuild();
    expect(model.listGenerationIssues()).toEqual([]);
    model.close();
  });

  it("rebuilds a lagging cache on open using Marker time instead of UUID order", async () => {
    const { root } = await fixture();
    const initial = new ReadModel(root);
    await initial.open();
    initial.close();
    const imageBytes = Buffer.from("89504e470d0a1a0a0000000d4948445201", "hex");
    const assetSha256 = digest(imageBytes);
    const record = await writeObject(
      root,
      `assets/sha256/${assetSha256.slice(0, 2)}/${assetSha256}.png`,
      imageBytes,
    );
    const nextMarkerId = "00000000-0000-4000-8000-000000000001";
    await writeFile(
      join(root, "archive", "commits", `${nextMarkerId}.json`),
      json({
        schemaVersion: 1,
        id: nextMarkerId,
        operation: "import_asset",
        createdAt: "2026-08-02T13:00:00.000Z",
        records: [record],
      }),
    );

    const reopened = new ReadModel(root);
    await reopened.open();

    expect(reopened.listGallery({ source: "all", limit: 10 }).total).toBe(2);
    expect(await reopened.status()).toMatchObject({
      lagCount: 0,
      lastIndexedMarker: nextMarkerId,
    });
    reopened.close();
  });

  it("rejects a committed record whose digest changed", async () => {
    const { root } = await fixture();
    await writeFile(join(root, "creations", creationId, "creation.json"), "{}\n");
    const model = new ReadModel(root);
    await expect(model.open()).rejects.toThrow("digest mismatch");
  });

  it("continues serving the previous snapshot while a rebuild is in progress", async () => {
    const { root } = await fixture();
    const model = new ReadModel(root);
    await model.open();

    const rebuilding = model.rebuild();
    expect(model.listGallery({ limit: 10 }).total).toBe(1);
    await rebuilding;
    expect(model.listGallery({ limit: 10 }).total).toBe(1);
    model.close();
  });
});
