import { describe, expect, it } from "vitest";
import { createSchemaRegistry } from "./index.js";

const legacyGeneration = {
  schemaVersion: 1,
  id: "755fc2f9-81a8-4d3a-89c4-3d60ca2ed21d",
  creationId: "f69e912d-c504-4278-89d5-4558ba452df0",
  promptRevisionId: "1567f72f-7a13-45cd-acd3-84a0090547e1",
  replayOfGenerationId: null,
  status: "succeeded",
  outcomeKnown: true,
  references: [],
  outputs: [],
  tool: { name: "image_gen.imagegen", model: null, parameters: {} },
  startedAt: "2026-08-02T12:02:05.000Z",
  completedAt: "2026-08-02T12:03:00.000Z",
  error: null,
} as const;

describe("Generation platform schema", () => {
  const schemas = createSchemaRegistry();

  it("accepts legacy missing platform and the supported OpenAI machine ID", () => {
    expect(schemas.validate("generation", legacyGeneration).valid).toBe(true);
    expect(schemas.validate("generation", { ...legacyGeneration, platform: "openai" }).valid).toBe(
      true,
    );
  });

  it("rejects an unsupported platform machine ID", () => {
    expect(schemas.validate("generation", { ...legacyGeneration, platform: "grok" }).valid).toBe(
      false,
    );
  });
});
