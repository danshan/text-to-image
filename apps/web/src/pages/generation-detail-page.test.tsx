import { render, screen, within } from "@testing-library/react";
import type { GenerationView } from "@text-to-image/api-contract";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../api/client";
import { GenerationDetailPage } from "./generation-detail-page";

function generation(platform: GenerationView["platform"]): GenerationView {
  return {
    id: "generation-1",
    creationId: "creation-1",
    promptRevisionId: "revision-1",
    replayOfGenerationId: null,
    platform,
    status: "succeeded",
    outcomeKnown: true,
    references: [],
    outputs: [],
    tool: { name: "image_gen.imagegen", model: null, parameters: {} },
    startedAt: "2026-08-04T08:03:00.000Z",
    completedAt: "2026-08-04T08:04:00.000Z",
    error: null,
  };
}

describe("GenerationDetailPage platform provenance", () => {
  it("labels a legacy inferred OpenAI Generation", async () => {
    const api = {
      generation: vi
        .fn()
        .mockResolvedValue(generation({ id: "openai", source: "legacy_inferred" })),
    } as unknown as ApiClient;

    render(<GenerationDetailPage api={api} generationId="generation-1" />);

    expect(await screen.findByText("OpenAI (legacy inferred)")).toBeTruthy();
  });

  it("labels an unrecognized legacy Generation as Unknown", async () => {
    const api = {
      generation: vi.fn().mockResolvedValue(generation({ id: null, source: "unknown" })),
    } as unknown as ApiClient;

    render(<GenerationDetailPage api={api} generationId="generation-1" />);

    const platform = (await screen.findByText("Platform")).parentElement;
    expect(within(platform!).getByText("Unknown")).toBeTruthy();
  });
});
