import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  beginGenerationVariant,
  captureGenerationOutput,
  commitGeneration,
  completeGeneration,
  createCreation,
  initLibrary,
  importImageAsset,
  markInvocationStarted,
  persistLibrarySelection,
  readCreationCuration,
  resolveProviderConfiguration,
  updateCreationCuration,
  validateLibrary,
} from "../../packages/archive/src/index.js";
import { readTransaction } from "../../packages/archive/src/transaction.js";
import {
  invokeXaiGeneration,
  resolveProviderInvocationModels,
  resolveXaiApiKey,
} from "../../apps/cli/src/providers.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl3sAAAAASUVORK5CYII=",
  "base64",
);

describe("Phase 19 multi-provider archive contracts", () => {
  it("checkpoints one Prompt Revision and creates independent provider transactions", () => {
    const owner = mkdtempSync(join(tmpdir(), "tti-phase19-"));
    try {
      const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;
      const creation = createCreation(libraryRoot, { prompt: "A shared provider study." });
      const begun = beginGenerationVariant(libraryRoot, creation.creation.id, {
        prompt: "A shared provider study with precise light.",
        changeInstruction: "Use precise light.",
        references: [],
        expectedCurationRevision: creation.curation.entityRevision,
        invocations: [
          {
            provider: "openai",
            tool: { name: "image_gen.imagegen", model: null, parameters: {} },
          },
          {
            provider: "xai",
            tool: {
              name: "xai.images.generate",
              model: "grok-imagine-image-quality",
              parameters: {},
            },
          },
        ],
      });

      expect(begun.generations).toHaveLength(2);
      expect(readCreationCuration(libraryRoot, creation.creation.id)).toMatchObject({
        entityRevision: creation.curation.entityRevision + 1,
        providerPreference: ["openai", "xai"],
      });
      expect(new Set(begun.generations.map((item) => item.revisionId))).toEqual(
        new Set([begun.revisionId]),
      );
      for (const generation of begun.generations) {
        expect(readTransaction(libraryRoot, generation.transactionId)).toMatchObject({
          state: "prepared",
          revisionId: begun.revisionId,
          stagedRecords: [],
        });
      }

      const output = join(owner, "output.png");
      writeFileSync(output, PNG_1X1);
      for (const generation of begun.generations) {
        markInvocationStarted(libraryRoot, generation.transactionId, begun.promptSha256);
        captureGenerationOutput(libraryRoot, generation.transactionId, output);
        completeGeneration(libraryRoot, generation.transactionId, {
          toolResult: {
            model: generation.provider === "xai" ? "grok-imagine-image-quality" : null,
            parameters: {},
            outputCount: 1,
          },
        });
        expect(commitGeneration(libraryRoot, generation.transactionId).generation).toMatchObject({
          provider: generation.provider,
          promptRevisionId: begun.revisionId,
          status: "succeeded",
        });
      }
      expect(validateLibrary(libraryRoot, "full").valid).toBe(true);
    } finally {
      rmSync(owner, { recursive: true, force: true });
    }
  });

  it("persists a bounded Creation Provider Preference", () => {
    const owner = mkdtempSync(join(tmpdir(), "tti-phase19-"));
    try {
      const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;
      const creation = createCreation(libraryRoot);
      const updated = updateCreationCuration(libraryRoot, creation.creation.id, 1, {
        providerPreference: ["openai", "xai"],
      });
      expect(updated.providerPreference).toEqual(["openai", "xai"]);
      expect(() =>
        updateCreationCuration(libraryRoot, creation.creation.id, 2, {
          providerPreference: ["xai", "xai"],
        }),
      ).toThrowError(expect.objectContaining({ code: "ARCHIVE_SCHEMA_INVALID" }));
    } finally {
      rmSync(owner, { recursive: true, force: true });
    }
  });

  it("merges tracked and local provider config without losing overrides on Library selection", () => {
    const owner = mkdtempSync(join(tmpdir(), "tti-phase19-config-"));
    try {
      writeFileSync(join(owner, ".git"), "gitdir: test\n");
      writeFileSync(
        join(owner, "text-to-image.config.json"),
        `${JSON.stringify({
          library: "./library",
          providers: {
            openai: { enabled: true },
            xai: {
              enabled: true,
              defaultModel: "grok-imagine-image-quality",
              timeoutSeconds: 600,
            },
          },
        })}\n`,
      );
      writeFileSync(
        join(owner, "text-to-image.local.json"),
        `${JSON.stringify({ providers: { xai: { timeoutSeconds: 900 } } })}\n`,
      );
      const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;

      expect(resolveProviderConfiguration({ gitRoot: owner }).providers.xai).toEqual({
        enabled: true,
        defaultModel: "grok-imagine-image-quality",
        timeoutSeconds: 900,
      });
      expect(
        resolveProviderInvocationModels(
          [
            { provider: "openai", tool: { model: null } },
            { provider: "xai", tool: { model: null } },
            { provider: "xai", tool: { model: "request-model" } },
          ],
          resolveProviderConfiguration({ gitRoot: owner }).providers,
        ),
      ).toEqual([
        { provider: "openai", tool: { model: null } },
        { provider: "xai", tool: { model: "grok-imagine-image-quality" } },
        { provider: "xai", tool: { model: "request-model" } },
      ]);
      persistLibrarySelection(owner, libraryRoot);
      expect(
        JSON.parse(readFileSync(join(owner, "text-to-image.local.json"), "utf8")),
      ).toMatchObject({
        library: libraryRoot,
        providers: { xai: { timeoutSeconds: 900 } },
      });
      writeFileSync(join(owner, ".env"), "XAI_API_KEY=file-key\n");
      expect(resolveXaiApiKey(owner, {})).toBe("file-key");
      expect(resolveXaiApiKey(owner, { XAI_API_KEY: "process-key" })).toBe("process-key");
    } finally {
      rmSync(owner, { recursive: true, force: true });
    }
  });

  it("invokes xAI with bounded base64 output and commits normalized provenance", async () => {
    const owner = mkdtempSync(join(tmpdir(), "tti-phase19-xai-"));
    let server: Server | null = null;
    try {
      const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;
      const creation = createCreation(libraryRoot);
      const begun = beginGenerationVariant(libraryRoot, creation.creation.id, {
        prompt: "A direct provider output.",
        changeInstruction: "",
        references: [],
        expectedCurationRevision: creation.curation.entityRevision,
        invocations: [
          {
            provider: "xai",
            tool: {
              name: "xai.images.generate",
              model: "grok-imagine-image-quality",
              parameters: { resolution: "1k" },
            },
          },
        ],
      });
      let requestBody: Record<string, unknown> | null = null;
      server = createServer((request, response) => {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk: string) => {
          body += chunk;
        });
        request.on("end", () => {
          requestBody = JSON.parse(body) as Record<string, unknown>;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ data: [{ b64_json: PNG_1X1.toString("base64") }] }));
        });
      });
      await new Promise<void>((resolve, reject) => {
        server!.once("error", reject);
        server!.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address() as AddressInfo;
      const result = await invokeXaiGeneration(libraryRoot, begun.generations[0]!.transactionId, {
        apiKey: "test-key",
        timeoutSeconds: 60,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });

      expect(requestBody).toMatchObject({
        model: "grok-imagine-image-quality",
        n: 1,
        response_format: "b64_json",
        resolution: "1k",
      });
      expect(result.generation).toMatchObject({
        provider: "xai",
        status: "succeeded",
        tool: { model: "grok-imagine-image-quality" },
      });
      expect(JSON.stringify(result)).not.toContain("test-key");
    } finally {
      if (server?.listening) {
        await new Promise<void>((resolve, reject) =>
          server!.close((error) => (error ? reject(error) : resolve())),
        );
      }
      rmSync(owner, { recursive: true, force: true });
    }
  });

  it("fails xAI credential preflight before invocation evidence", async () => {
    const owner = mkdtempSync(join(tmpdir(), "tti-phase19-xai-"));
    try {
      const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;
      const creation = createCreation(libraryRoot);
      const begun = beginGenerationVariant(libraryRoot, creation.creation.id, {
        prompt: "A credential boundary study.",
        changeInstruction: "",
        references: [],
        expectedCurationRevision: creation.curation.entityRevision,
        invocations: [
          {
            provider: "xai",
            tool: {
              name: "xai.images.generate",
              model: "grok-imagine-image-quality",
              parameters: {},
            },
          },
        ],
      });
      const transactionId = begun.generations[0]!.transactionId;

      await expect(
        invokeXaiGeneration(libraryRoot, transactionId, { timeoutSeconds: 60 }),
      ).rejects.toMatchObject({ code: "IMAGE_PROVIDER_AUTH_MISSING" });
      expect(readTransaction(libraryRoot, transactionId).state).toBe("prepared");
    } finally {
      rmSync(owner, { recursive: true, force: true });
    }
  });

  it("maps committed Reference Images to the xAI edit transport", async () => {
    const owner = mkdtempSync(join(tmpdir(), "tti-phase19-xai-ref-"));
    try {
      const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;
      const source = join(owner, "reference.png");
      writeFileSync(source, PNG_1X1);
      const asset = importImageAsset(libraryRoot, source);
      const creation = createCreation(libraryRoot);
      const begun = beginGenerationVariant(libraryRoot, creation.creation.id, {
        prompt: "Preserve the reference composition.",
        changeInstruction: "",
        references: [
          {
            assetSha256: asset.assetSha256,
            roles: ["composition"],
            guidance: "Preserve framing.",
          },
        ],
        expectedCurationRevision: creation.curation.entityRevision,
        invocations: [
          {
            provider: "xai",
            tool: {
              name: "xai.images.edit",
              model: "grok-imagine-image-quality",
              parameters: {},
            },
          },
        ],
      });
      let requestUrl = "";
      let requestBody: Record<string, unknown> | null = null;

      await invokeXaiGeneration(libraryRoot, begun.generations[0]!.transactionId, {
        apiKey: "test-key",
        timeoutSeconds: 60,
        fetch: (input, init) => {
          requestUrl = requestUrlFromInput(input);
          if (typeof init?.body !== "string") throw new Error("Expected a JSON request body.");
          requestBody = JSON.parse(init.body) as Record<string, unknown>;
          return Promise.resolve(
            new Response(JSON.stringify({ data: [{ b64_json: PNG_1X1.toString("base64") }] }), {
              status: 200,
            }),
          );
        },
      });

      expect(requestUrl).toBe("https://api.x.ai/v1/images/edits");
      const images: unknown = requestBody && requestBody["images"];
      expect(Array.isArray(images)).toBe(true);
      if (!Array.isArray(images)) throw new Error("Expected xAI image inputs.");
      const firstImage: unknown = images[0];
      expect(
        typeof firstImage === "object" &&
          firstImage !== null &&
          "url" in firstImage &&
          typeof firstImage.url === "string" &&
          /^data:image\/png;base64,/u.test(firstImage.url),
      ).toBe(true);
    } finally {
      rmSync(owner, { recursive: true, force: true });
    }
  });

  it("normalizes known xAI failures and uncertain transport failures", async () => {
    const owner = mkdtempSync(join(tmpdir(), "tti-phase19-xai-"));
    try {
      const libraryRoot = initLibrary(join(owner, "library")).libraryRoot;
      const creation = createCreation(libraryRoot);
      let expectedCurationRevision = creation.curation.entityRevision;
      const begin = () =>
        beginGenerationVariant(libraryRoot, creation.creation.id, {
          prompt: "A provider failure study.",
          changeInstruction: "",
          references: [],
          expectedCurationRevision: expectedCurationRevision++,
          invocations: [
            {
              provider: "xai",
              tool: {
                name: "xai.images.generate",
                model: "grok-imagine-image-quality",
                parameters: {},
              },
            },
          ],
        }).generations[0]!;

      const rateLimited = await invokeXaiGeneration(libraryRoot, begin().transactionId, {
        apiKey: "test-key",
        timeoutSeconds: 60,
        fetch: () =>
          Promise.resolve(
            new Response(JSON.stringify({ error: { code: "rate_limit" } }), {
              status: 429,
            }),
          ),
      });
      expect(rateLimited.generation).toMatchObject({
        status: "failed",
        outcomeKnown: true,
        error: { code: "IMAGE_PROVIDER_RATE_LIMITED", retryable: true },
      });

      const interrupted = await invokeXaiGeneration(libraryRoot, begin().transactionId, {
        apiKey: "test-key",
        timeoutSeconds: 60,
        fetch: () => Promise.reject(new TypeError("connection reset with secret details")),
      });
      expect(interrupted.generation).toMatchObject({
        status: "interrupted",
        outcomeKnown: false,
        error: { code: "GENERATION_OUTCOME_UNKNOWN" },
      });
      expect(JSON.stringify(interrupted)).not.toContain("secret details");
    } finally {
      rmSync(owner, { recursive: true, force: true });
    }
  });
});

function requestUrlFromInput(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}
