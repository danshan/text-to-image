import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreationDetail } from "@text-to-image/api-contract";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../api/client";
import { CreationDetailPage } from "./creation-detail-page";

const creationId = "creation-1";
const revisionOneId = "revision-0001";
const revisionTwoId = "revision-0002";
const generationOneId = "generation-0001";
const generationTwoId = "generation-0002";
const generationThreeId = "generation-0003";

function generation(
  id: string,
  promptRevisionId: string,
  startedAt: string,
  referenceSha256: string,
): CreationDetail["generations"][number] {
  return {
    id,
    creationId,
    promptRevisionId,
    replayOfGenerationId: null,
    platform: { id: "openai", source: "recorded" },
    status: "succeeded",
    outcomeKnown: true,
    references: [
      {
        assetSha256: referenceSha256,
        roles: ["style"],
        guidance: "Use the lighting only.",
      },
    ],
    outputs: [],
    tool: { name: "image_gen.imagegen", model: null, parameters: {} },
    startedAt,
    completedAt: startedAt,
    error: null,
  };
}

function detail(): CreationDetail {
  return {
    id: creationId,
    createdAt: "2026-08-04T08:00:00.000Z",
    title: "Linked history",
    status: "active",
    tags: [],
    favorite: false,
    note: "",
    entityRevision: 0,
    generationCount: 3,
    imageCount: 0,
    draft: {
      content: "Current draft",
      contentSha256: "draft-sha256",
      basedOnRevisionId: revisionTwoId,
      updatedAt: "2026-08-04T08:04:00.000Z",
      externalEdit: false,
    },
    revisions: [
      {
        id: revisionOneId,
        creationId,
        parentRevisionId: null,
        changeInstruction: "First prompt",
        prompt: "First prompt content",
        promptSha256: "revision-one-sha256",
        createdAt: "2026-08-04T08:01:00.000Z",
      },
      {
        id: revisionTwoId,
        creationId,
        parentRevisionId: revisionOneId,
        changeInstruction: "Second prompt",
        prompt: "Second prompt content",
        promptSha256: "revision-two-sha256",
        createdAt: "2026-08-04T08:02:00.000Z",
      },
    ],
    generations: [
      generation(generationOneId, revisionOneId, "2026-08-04T08:03:00.000Z", "reference-one"),
      generation(generationTwoId, revisionOneId, "2026-08-04T08:04:00.000Z", "reference-two"),
      generation(generationThreeId, revisionTwoId, "2026-08-04T08:05:00.000Z", "reference-three"),
    ],
  };
}

describe("CreationDetailPage provenance focus", () => {
  it("keeps compare state separate while linking revisions, generations, and references", async () => {
    window.history.replaceState({}, "", `/creations/${creationId}`);
    const api = {
      creation: vi.fn().mockResolvedValue(detail()),
    } as unknown as ApiClient;
    const user = userEvent.setup();

    render(<CreationDetailPage api={api} creationId={creationId} />);

    await screen.findByRole("heading", { name: "Prompt History" });
    const latestGeneration = document.getElementById(`generation-${generationThreeId}`);
    expect(latestGeneration?.className).toContain("is-focused");
    expect(latestGeneration?.textContent).toContain("OpenAI");

    await user.click(screen.getByRole("button", { name: /R001/ }));

    expect(new URLSearchParams(window.location.search).get("revision")).toBe(revisionOneId);
    expect(new URLSearchParams(window.location.search).has("generation")).toBe(false);
    expect(document.getElementById(`generation-${generationOneId}`)?.className).toContain(
      "is-related",
    );
    expect(document.getElementById(`generation-${generationTwoId}`)?.className).toContain(
      "is-related",
    );
    expect(document.getElementById(`generation-${generationThreeId}`)?.className).toContain(
      "is-muted",
    );
    expect(
      within(document.getElementById(`revision-${revisionOneId}`)!).getAllByRole("img", {
        name: /Reference image/,
      }),
    ).toHaveLength(2);

    await user.click(screen.getAllByRole("checkbox", { name: "Compare" })[0]!);
    expect(new URLSearchParams(window.location.search).get("revision")).toBe(revisionOneId);

    await user.click(
      within(document.getElementById(`generation-${generationOneId}`)!).getByRole("button", {
        name: new RegExp(generationOneId.slice(0, 12), "u"),
      }),
    );
    const parameters = new URLSearchParams(window.location.search);
    expect(parameters.get("revision")).toBe(revisionOneId);
    expect(parameters.get("generation")).toBe(generationOneId);
  });
});
