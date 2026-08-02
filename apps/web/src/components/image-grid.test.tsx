import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../api/client";
import type { ImageSummary } from "../types";
import { ImageGrid } from "./image-grid";

const image: ImageSummary = {
  sha256: "a".repeat(64),
  mediaType: "image/png",
  width: 800,
  height: 1200,
  createdAt: "2026-08-02T08:00:00.000Z",
  creationId: "creation-1",
  creationTitle: "Soft light study",
  generationId: "generation-1",
  generationStatus: "succeeded",
  entityRevision: 3,
  tags: ["portrait"],
  favorite: false,
  rating: 4,
  hidden: false,
  note: "Editorial portrait in side light",
  imported: false,
};

describe("ImageGrid", () => {
  it("renders a semantic image link and performs optimistic curation", async () => {
    const user = userEvent.setup();
    const patchImageCuration = vi.fn().mockResolvedValue({ ...image, favorite: true });
    const onMutation = vi.fn();
    const api = { patchImageCuration } as unknown as ApiClient;

    render(<ImageGrid items={[image]} api={api} onMutation={onMutation} />);
    expect(screen.getByRole("img", { name: image.note })).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe(`/images/${image.sha256}`);

    await user.click(screen.getByRole("button", { name: "Add to favorites" }));
    expect(patchImageCuration).toHaveBeenCalledWith(image.sha256, {
      expectedRevision: 3,
      patch: { favorite: true },
    });
    expect(onMutation).toHaveBeenCalled();
  });
});
