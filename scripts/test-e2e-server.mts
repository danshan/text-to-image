import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  captureGenerationOutput,
  commitGeneration,
  completeGeneration,
  markInvocationStarted,
  prepareGeneration,
} from "@text-to-image/archive";
import { createApp } from "../apps/server/src/app.js";
import { LibraryRuntime } from "../apps/server/src/shared/library-runtime.js";

const root = resolve(import.meta.dirname, "..");
const testRoot = await mkdtemp(join(tmpdir(), "text-to-image-e2e-"));
const libraryRoot = join(testRoot, "library");
await cp(join(root, "fixtures", "asset-libraries", "v1-minimal"), libraryRoot, {
  recursive: true,
  force: false,
});

const fixtureCreationId = "f69e912d-c504-4278-89d5-4558ba452df0";
const generatedPath = join(testRoot, "generated.png");
await writeFile(
  generatedPath,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl3sAAAAASUVORK5CYII=",
    "base64",
  ),
);
const firstPrepared = prepareGeneration(libraryRoot, fixtureCreationId, {
  prompt: "A minimal geometric frame with warm editorial lighting.",
  changeInstruction: "Create a deterministic E2E fixture.",
  basedOnRevisionId: null,
  references: [],
  replayOfGenerationId: null,
  tool: { name: "fake.imagegen", model: null, parameters: { fixture: true } },
});
markInvocationStarted(libraryRoot, firstPrepared.transactionId);
captureGenerationOutput(libraryRoot, firstPrepared.transactionId, generatedPath);
completeGeneration(libraryRoot, firstPrepared.transactionId, {
  toolResult: { model: null, parameters: { fixture: true }, outputCount: 1 },
});
commitGeneration(libraryRoot, firstPrepared.transactionId);

const secondPrepared = prepareGeneration(libraryRoot, fixtureCreationId, {
  prompt: "A minimal geometric frame with cool editorial lighting and stronger contrast.",
  changeInstruction: "Shift the palette and increase contrast.",
  basedOnRevisionId: firstPrepared.revisionId,
  references: [],
  replayOfGenerationId: null,
  tool: { name: "fake.imagegen", model: null, parameters: { fixture: true, variant: 2 } },
});
markInvocationStarted(libraryRoot, secondPrepared.transactionId);
captureGenerationOutput(libraryRoot, secondPrepared.transactionId, generatedPath);
completeGeneration(libraryRoot, secondPrepared.transactionId, {
  toolResult: {
    model: null,
    parameters: { fixture: true, variant: 2 },
    outputCount: 1,
  },
});
commitGeneration(libraryRoot, secondPrepared.transactionId);

prepareGeneration(libraryRoot, fixtureCreationId, {
  prompt: "A prepared but not invoked recovery fixture.",
  changeInstruction: "Exercise recovery dry-run behavior.",
  basedOnRevisionId: secondPrepared.revisionId,
  references: [],
  replayOfGenerationId: null,
  tool: { name: "fake.imagegen", model: null, parameters: { fixture: true, recovery: true } },
});
await rm(generatedPath, { force: true });

const runtime = await LibraryRuntime.create({ gitRoot: root, libraryArgument: libraryRoot });
const { app, security } = await createApp({
  runtime,
  logLevel: "warn",
  webRoot: join(root, "apps", "web", "dist"),
});
const address = await app.listen({ host: "127.0.0.1", port: 4173 });
security.allowHost(new URL(address).host);

let closing = false;
async function close(): Promise<void> {
  if (closing) return;
  closing = true;
  await app.close();
  runtime.close();
  if (!basename(testRoot).startsWith("text-to-image-e2e-")) {
    throw new TypeError("Refusing to clean an unexpected E2E Library path");
  }
  await rm(testRoot, { recursive: true });
}

process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());
