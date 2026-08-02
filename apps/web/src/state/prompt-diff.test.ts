import { describe, expect, it } from "vitest";
import { diffWords } from "./prompt-diff";

describe("prompt diff", () => {
  it("marks insertions and deletions while preserving whitespace", () => {
    const parts = diffWords("soft red light", "soft blue rim light");

    expect(parts.map((part) => part.operation)).toContain("delete");
    expect(parts.map((part) => part.operation)).toContain("insert");
    expect(parts.map((part) => part.value).join("")).toContain("soft");
    expect(
      parts
        .filter((part) => part.operation === "insert")
        .map((part) => part.value)
        .join(""),
    ).toContain("blue");
  });

  it("returns one equal segment for identical prompts", () => {
    expect(diffWords("same prompt", "same prompt")).toEqual([
      { operation: "equal", value: "same prompt" },
    ]);
  });
});
