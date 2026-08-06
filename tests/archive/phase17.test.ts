import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run as runAssetctl } from "../../apps/cli/src/main.js";
import {
  createCreation,
  creationPurgeTarget,
  commitGeneration,
  executePurge,
  failGeneration,
  imagePurgeTarget,
  importImageAsset,
  initLibrary,
  markInvocationStarted,
  prepareGeneration,
  preparePurge,
  recoverPurge,
  readCommitMarkers,
  updateCreationCuration,
  validateLibrary,
} from "../../packages/archive/src/index.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl3sAAAAASUVORK5CYII=",
  "base64",
);

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Purge verified replacement", () => {
  it("purges a Creation graph without deleting Library-scoped Image Assets", () => {
    const owner = makeOwner();
    const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;
    const source = join(owner, "asset.png");
    writeFileSync(source, PNG_1X1);
    const asset = importImageAsset(libraryRoot, source);
    const creation = createCreation(libraryRoot, {
      title: "Disposable Creation",
      prompt: "A private draft",
    });
    const target = creationPurgeTarget(creation.creation.id);
    const plan = preparePurge(libraryRoot, target);

    expect(plan.executable).toBe(true);
    executePurge(libraryRoot, target, {
      planDigest: plan.planDigest,
      confirmed: true,
    });

    expect(existsSync(join(libraryRoot, "creations", creation.creation.id))).toBe(false);
    expect(
      existsSync(
        join(
          libraryRoot,
          "assets",
          "sha256",
          asset.assetSha256.slice(0, 2),
          `${asset.assetSha256}.png`,
        ),
      ),
    ).toBe(true);
    expect(validateLibrary(libraryRoot, "full").valid).toBe(true);
    expect(
      readCommitMarkers(libraryRoot)
        .flatMap((marker) => marker.records)
        .some((record) => record.path.startsWith(`creations/${creation.creation.id}/`)),
    ).toBe(false);
  });

  it("purges an unreferenced Image Asset and preserves identical Inbox content", () => {
    const owner = makeOwner();
    const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;
    const source = join(owner, "asset.png");
    writeFileSync(source, PNG_1X1);
    const asset = importImageAsset(libraryRoot, source);
    const inboxCopy = join(libraryRoot, "inbox", "original.png");
    writeFileSync(inboxCopy, PNG_1X1);
    const target = imagePurgeTarget(asset.assetSha256);
    const plan = preparePurge(libraryRoot, target);

    expect(plan.warnings).toHaveLength(1);
    executePurge(libraryRoot, target, {
      planDigest: plan.planDigest,
      confirmed: true,
    });

    expect(readFileSync(inboxCopy)).toEqual(PNG_1X1);
    expect(validateLibrary(libraryRoot, "full").valid).toBe(true);
    expect(
      readCommitMarkers(libraryRoot)
        .flatMap((marker) => marker.records)
        .some((record) => record.path.includes(asset.assetSha256)),
    ).toBe(false);
  });

  it("rejects a stale Plan before candidate construction", () => {
    const owner = makeOwner();
    const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;
    const creation = createCreation(libraryRoot, { title: "Mutable" });
    const target = creationPurgeTarget(creation.creation.id);
    const plan = preparePurge(libraryRoot, target);
    updateCreationCuration(libraryRoot, creation.creation.id, 1, { note: "changed" });

    expect(() =>
      executePurge(libraryRoot, target, {
        planDigest: plan.planDigest,
        confirmed: true,
      }),
    ).toThrowError(expect.objectContaining({ code: "PURGE_PLAN_STALE" }));
    expect(existsSync(join(libraryRoot, "creations", creation.creation.id))).toBe(true);
  });

  it("requires explicit confirmation after preparing the Plan", () => {
    const owner = makeOwner();
    const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;
    const creation = createCreation(libraryRoot, { title: "Unconfirmed" });
    const target = creationPurgeTarget(creation.creation.id);
    const plan = preparePurge(libraryRoot, target);

    expect(() =>
      executePurge(libraryRoot, target, {
        planDigest: plan.planDigest,
        confirmed: false,
      }),
    ).toThrowError(expect.objectContaining({ code: "PURGE_CONFIRMATION_REQUIRED" }));
    expect(existsSync(join(libraryRoot, "creations", creation.creation.id))).toBe(true);
  });

  it("returns every surviving Generation relation that blocks Image Asset Purge", () => {
    const owner = makeOwner();
    const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;
    const source = join(owner, "asset.png");
    writeFileSync(source, PNG_1X1);
    const asset = importImageAsset(libraryRoot, source);
    const creation = createCreation(libraryRoot, { title: "Reference owner" });
    const prepared = prepareGeneration(libraryRoot, creation.creation.id, {
      prompt: "Use the reference.",
      changeInstruction: "",
      references: [{ assetSha256: asset.assetSha256, roles: ["subject"] }],
      tool: { name: "image_gen.imagegen", model: null, parameters: {} },
    });
    markInvocationStarted(libraryRoot, prepared.transactionId);
    failGeneration(libraryRoot, prepared.transactionId, {
      error: { code: "TEST_FAILURE", message: "No output", retryable: false },
    });
    commitGeneration(libraryRoot, prepared.transactionId);

    const plan = preparePurge(libraryRoot, imagePurgeTarget(asset.assetSha256));

    expect(plan.executable).toBe(false);
    expect(plan.blockingRelations).toEqual([
      {
        creationId: creation.creation.id,
        generationId: prepared.generationId,
        relationType: "reference",
      },
    ]);
  });

  it("exposes prepare and execute through the root CLI contract", async () => {
    const owner = makeOwner();
    const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;
    const creation = createCreation(libraryRoot, { title: "CLI target" });
    const prepared = await runAssetctl([
      "purge",
      "creation",
      "prepare",
      "--creation",
      creation.creation.id,
      "--library",
      libraryRoot,
      "--format",
      "json",
    ]);
    const plan = prepared.value as { planDigest: string };

    await expect(
      runAssetctl([
        "purge",
        "creation",
        "execute",
        "--creation",
        creation.creation.id,
        "--library",
        libraryRoot,
        "--plan-digest",
        plan.planDigest,
        "--format",
        "json",
      ]),
    ).rejects.toMatchObject({ code: "PURGE_CONFIRMATION_REQUIRED" });

    const executed = await runAssetctl([
      "purge",
      "creation",
      "execute",
      "--creation",
      creation.creation.id,
      "--library",
      libraryRoot,
      "--plan-digest",
      plan.planDigest,
      "--confirm",
      "--format",
      "json",
    ]);

    expect(executed).toMatchObject({ exitCode: 0, value: { deletedPathCount: 3 } });
    expect(validateLibrary(libraryRoot, "full").valid).toBe(true);
  });

  it("blocks writers and rolls back a pre-cutover candidate on startup recovery", () => {
    const owner = makeOwner();
    const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;
    const creation = createCreation(libraryRoot, { title: "Preserved" });
    const operationId = "44444444-4444-4444-8444-444444444444";
    const candidateRoot = join(owner, `.text-to-image-purge-${operationId}.candidate`);
    const retiredRoot = join(owner, `.text-to-image-purge-${operationId}.retired`);
    const journalPath = join(owner, `.text-to-image-purge-${operationId}.json`);
    cpSync(libraryRoot, candidateRoot, { recursive: true });
    writeFileSync(
      journalPath,
      `${JSON.stringify({
        schemaVersion: 1,
        operationId,
        libraryRoot,
        candidateRoot,
        retiredRoot,
        target: { kind: "creation", creationId: creation.creation.id },
        planDigest: "a".repeat(64),
        phase: "candidate_ready",
        updatedAt: "2026-08-05T00:00:00.000Z",
      })}\n`,
    );

    expect(() => createCreation(libraryRoot, { title: "Blocked" })).toThrowError(
      expect.objectContaining({ code: "PURGE_MAINTENANCE_ACTIVE" }),
    );
    expect(recoverPurge(libraryRoot)).toBeNull();
    expect(existsSync(candidateRoot)).toBe(false);
    expect(existsSync(journalPath)).toBe(false);
    expect(existsSync(join(libraryRoot, "creations", creation.creation.id))).toBe(true);
  });

  it("includes malformed recovery evidence only after exact transaction selection", () => {
    const owner = makeOwner();
    const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;
    const creation = createCreation(libraryRoot, { title: "Recovery target" });
    const transactionId = "55555555-5555-4555-8555-555555555555";
    const quarantine = join(libraryRoot, ".quarantine", `${transactionId}-quarantined`);
    mkdirSync(quarantine);
    writeFileSync(join(quarantine, "transaction.json"), "not-json\n");

    const initial = preparePurge(libraryRoot, creationPurgeTarget(creation.creation.id));
    expect(initial.recoveryEvidence).toEqual([]);
    const selected = preparePurge(libraryRoot, creationPurgeTarget(creation.creation.id), {
      abandonRecoveryTransactionIds: [transactionId],
    });

    expect(selected.executable).toBe(true);
    expect(selected.recoveryEvidence).toEqual([
      {
        transactionId,
        location: "quarantine",
        state: "malformed",
        byteCount: 9,
      },
    ]);
  });

  it("rolls forward when the original rename completed before its journal update", () => {
    const owner = makeOwner();
    const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;
    const creation = createCreation(libraryRoot, { title: "Removed in candidate" });
    const operationId = "66666666-6666-4666-8666-666666666666";
    const candidateRoot = join(owner, `.text-to-image-purge-${operationId}.candidate`);
    const retiredRoot = join(owner, `.text-to-image-purge-${operationId}.retired`);
    const journalPath = join(owner, `.text-to-image-purge-${operationId}.json`);
    cpSync(libraryRoot, candidateRoot, { recursive: true });
    writeFileSync(
      journalPath,
      `${JSON.stringify({
        schemaVersion: 1,
        operationId,
        libraryRoot,
        candidateRoot,
        retiredRoot,
        target: { kind: "creation", creationId: creation.creation.id },
        planDigest: "a".repeat(64),
        phase: "candidate_ready",
        updatedAt: "2026-08-05T00:00:00.000Z",
      })}\n`,
    );
    renameSync(libraryRoot, retiredRoot);

    expect(recoverPurge(libraryRoot)).toBeNull();
    expect(existsSync(libraryRoot)).toBe(true);
    expect(existsSync(candidateRoot)).toBe(false);
    expect(existsSync(retiredRoot)).toBe(false);
    expect(validateLibrary(libraryRoot, "full").valid).toBe(true);
  });
});

function makeOwner(): string {
  const root = mkdtempSync(join(tmpdir(), "tti-archive-phase17-"));
  roots.push(root);
  return root;
}
