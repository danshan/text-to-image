import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  defaultGalleryQuery,
  parseGalleryQuery,
  serializeGalleryQuery,
} from "./gallery-query";

describe("gallery query state", () => {
  it("round-trips normalized URL state", () => {
    const query = {
      ...defaultGalleryQuery,
      q: "soft light",
      tags: ["portrait", "editorial"],
      favorite: true,
      rating: 4,
      role: "composition",
      provider: "xai",
      sort: "rating_desc" as const,
      showHidden: true,
    };

    const serialized = serializeGalleryQuery(query);

    expect(parseGalleryQuery(serialized)).toEqual({ ...query, tags: ["editorial", "portrait"] });
    expect(serialized).toContain("tag=editorial");
    expect(serialized).toContain("tag=portrait");
    expect(serialized).toContain("provider=xai");
  });

  it("rejects unsupported enum and rating values", () => {
    const query = parseGalleryQuery("?sort=random&source=remote&rating=9&status=deleted");

    expect(query.sort).toBe("newest");
    expect(query.source).toBe("output");
    expect(query.rating).toBeNull();
    expect(query.creationStatus).toBe("");
  });

  it("counts each active tag as a distinct filter", () => {
    expect(
      activeFilterCount({ ...defaultGalleryQuery, tags: ["one", "two"], favorite: true }),
    ).toBe(3);
  });
});
