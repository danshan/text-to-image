import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { CurationPatchRequest } from "../types";
import { CurationEditor } from "./curation-editor";

const value = {
  tags: ["portrait"],
  favorite: false,
  rating: 2,
  note: "First note",
  hidden: false,
  entityRevision: 4,
};

describe("CurationEditor", () => {
  it("submits the expected entity revision", async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(request: CurationPatchRequest) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(<CurationEditor kind="image" value={value} onSave={onSave} />);

    await user.click(screen.getByLabelText("Favorite"));
    await user.click(screen.getByRole("button", { name: "Save curation" }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0]?.[0].expectedRevision).toBe(4);
    expect(onSave.mock.calls[0]?.[0].patch.favorite).toBe(true);
  });

  it("preserves local edits when optimistic concurrency conflicts", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(
      new ApiError(409, {
        code: "CURATION_CONFLICT",
        message: "Curation changed.",
        correlationId: "test-correlation",
      }),
    );
    render(<CurationEditor kind="image" value={value} onSave={onSave} />);

    const note = screen.getByLabelText("Note");
    await user.clear(note);
    await user.type(note, "Unsaved local note");
    await user.click(screen.getByRole("button", { name: "Save curation" }));

    expect((note as HTMLTextAreaElement).value).toBe("Unsaved local note");
    expect(screen.getByText(/edits are preserved/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review and retry" })).toBeTruthy();
  });
});
