import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GenerationView } from "../types";
import { GenerationErrorPanel, generationFailureSummary } from "./generation-issue";

function generation(overrides: Partial<GenerationView> = {}): GenerationView {
  return {
    id: "generation-1",
    creationId: "creation-1",
    promptRevisionId: "revision-1",
    replayOfGenerationId: null,
    status: "failed",
    outcomeKnown: true,
    references: [],
    outputs: [],
    tool: { name: "image_gen.imagegen", model: null, parameters: {} },
    startedAt: "2026-08-03T00:00:00.000Z",
    completedAt: "2026-08-03T00:00:01.000Z",
    error: null,
    ...overrides,
  };
}

describe("GenerationErrorPanel", () => {
  it("explains an output safety rejection without claiming a prompt violation", () => {
    render(
      <GenerationErrorPanel
        generation={generation({
          error: {
            code: "IMAGE_GENERATION_SAFETY_REJECTED",
            summary: "The generated result was rejected by safety moderation.",
            retryable: false,
            moderation: { stage: "output", categories: ["sexual"] },
          },
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Safety review rejected this result" }),
    ).toBeTruthy();
    expect(screen.getByText("output")).toBeTruthy();
    expect(screen.getByText("sexual")).toBeTruthy();
    expect(screen.getByText(/does not by itself prove/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit Prompt Draft" }).getAttribute("href")).toBe(
      "/creations/creation-1#prompt-draft",
    );
  });

  it("falls back to a bounded message for older generic failures", () => {
    const item = generation({
      error: { summary: "Legacy provider failure" } as unknown as GenerationView["error"],
    });
    render(<GenerationErrorPanel generation={item} />);

    expect(screen.getByText("Legacy provider failure")).toBeTruthy();
    expect(screen.getByText("GENERATION_FAILED")).toBeTruthy();
  });

  it("keeps interrupted outcomes separate from known failures", () => {
    const item = generation({ status: "interrupted", outcomeKnown: false });
    expect(generationFailureSummary(item)).toContain("outcome is unknown");
    render(<GenerationErrorPanel generation={item} />);

    expect(screen.getByRole("heading", { name: "Outcome unknown" })).toBeTruthy();
    expect(screen.getByText(/Do not treat an interrupted invocation/i)).toBeTruthy();
    expect(screen.queryByText("Generation failed")).toBeNull();
  });
});
