import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PromptDiff } from "./prompt-diff";

describe("PromptDiff", () => {
  it("provides textual insertion and deletion labels", () => {
    render(<PromptDiff before="red portrait" after="blue portrait" />);

    expect(screen.getByText(/Deletion:/)).toBeTruthy();
    expect(screen.getByText(/Insertion:/)).toBeTruthy();
    expect(screen.getByLabelText("Prompt revision comparison")).toBeTruthy();
  });
});
