import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GenerationIssue } from "../types";
import { GenerationIssuesRegion } from "./generation-issues-region";

const issue: GenerationIssue = {
  generationId: "generation-1",
  creationId: "creation-1",
  creationTitle: "Night banquet",
  status: "failed",
  outcomeKnown: true,
  completedAt: "2026-08-03T00:00:01.000Z",
  error: {
    code: "IMAGE_GENERATION_SAFETY_REJECTED",
    summary: "The generated result was rejected by safety moderation.",
    retryable: false,
    moderation: { stage: "output", categories: ["sexual"] },
  },
};

describe("GenerationIssuesRegion", () => {
  it("keeps issues separate from the image grid and links to review", () => {
    render(<GenerationIssuesRegion issues={[issue]} status="success" onRetry={vi.fn()} />);

    expect(screen.getByRole("region", { name: "Generation Issues" })).toBeTruthy();
    expect(screen.getByText("Night banquet")).toBeTruthy();
    expect(screen.getByText(/Output moderation rejected/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review Prompt" }).getAttribute("href")).toBe(
      "/generations/generation-1",
    );
  });

  it("does not render an empty region after a later successful generation", () => {
    render(<GenerationIssuesRegion issues={[]} status="success" onRetry={vi.fn()} />);

    expect(screen.queryByRole("heading", { name: "Generation Issues" })).toBeNull();
  });

  it("offers retry when issue history is unavailable", () => {
    const onRetry = vi.fn();
    render(<GenerationIssuesRegion status="error" onRetry={onRetry} />);

    expect(screen.getByText("Issue history could not be loaded.")).toBeTruthy();
    screen.getByRole("button", { name: "Try again" }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
