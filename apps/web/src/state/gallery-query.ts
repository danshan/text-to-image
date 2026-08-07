export type GallerySort = "newest" | "oldest" | "rating_desc";
export type SourceFilter = "output" | "imported" | "all";

export interface GalleryQuery {
  q: string;
  creation: string;
  creationStatus: "" | "active" | "shelved";
  tags: string[];
  favorite: boolean;
  rating: number | null;
  source: SourceFilter;
  role: string;
  generationStatus: string;
  tool: string;
  provider: string;
  model: string;
  from: string;
  to: string;
  sort: GallerySort;
  showHidden: boolean;
  cursor: string;
}

export const defaultGalleryQuery: GalleryQuery = {
  q: "",
  creation: "",
  creationStatus: "",
  tags: [],
  favorite: false,
  rating: null,
  source: "output",
  role: "",
  generationStatus: "",
  tool: "",
  provider: "",
  model: "",
  from: "",
  to: "",
  sort: "newest",
  showHidden: false,
  cursor: "",
};

const supportedSorts = new Set<GallerySort>(["newest", "oldest", "rating_desc"]);
const supportedSources = new Set<SourceFilter>(["output", "imported", "all"]);

export function parseGalleryQuery(search: string): GalleryQuery {
  const params = new URLSearchParams(search);
  const ratingValue = Number(params.get("rating"));
  const sortValue = params.get("sort") as GallerySort | null;
  const sourceValue = params.get("source") as SourceFilter | null;

  return {
    q: params.get("q") ?? "",
    creation: params.get("creationId") ?? "",
    creationStatus: parseCreationStatus(params.get("status")),
    tags: unique(
      params
        .getAll("tag")
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
    favorite: params.get("favorite") === "true",
    rating:
      Number.isInteger(ratingValue) && ratingValue >= 1 && ratingValue <= 5 ? ratingValue : null,
    source:
      sourceValue && supportedSources.has(sourceValue) ? sourceValue : defaultGalleryQuery.source,
    role: params.get("role") ?? "",
    generationStatus: params.get("generationStatus") ?? "",
    tool: params.get("tool") ?? "",
    provider: params.get("provider") ?? "",
    model: params.get("model") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    sort: sortValue && supportedSorts.has(sortValue) ? sortValue : defaultGalleryQuery.sort,
    showHidden: params.get("hidden") === "include",
    cursor: params.get("cursor") ?? "",
  };
}

export function serializeGalleryQuery(query: GalleryQuery): string {
  const params = new URLSearchParams();
  setIf(params, "q", query.q);
  setIf(params, "creationId", query.creation);
  setIf(params, "status", query.creationStatus);
  for (const tag of unique(query.tags).sort()) {
    params.append("tag", tag);
  }
  if (query.favorite) params.set("favorite", "true");
  if (query.rating !== null) params.set("rating", String(query.rating));
  if (query.source !== defaultGalleryQuery.source) params.set("source", query.source);
  setIf(params, "role", query.role);
  setIf(params, "generationStatus", query.generationStatus);
  setIf(params, "tool", query.tool);
  setIf(params, "provider", query.provider);
  setIf(params, "model", query.model);
  setIf(params, "from", query.from);
  setIf(params, "to", query.to);
  if (query.sort !== defaultGalleryQuery.sort) params.set("sort", query.sort);
  if (query.showHidden) params.set("hidden", "include");
  setIf(params, "cursor", query.cursor);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function activeFilterCount(query: GalleryQuery): number {
  return [
    query.creation,
    query.creationStatus,
    ...query.tags,
    query.favorite,
    query.rating,
    query.source !== defaultGalleryQuery.source,
    query.role,
    query.generationStatus,
    query.tool,
    query.provider,
    query.model,
    query.from,
    query.to,
    query.showHidden,
  ].filter(Boolean).length;
}

function parseCreationStatus(value: string | null): GalleryQuery["creationStatus"] {
  return value === "active" || value === "shelved" ? value : "";
}

function setIf(params: URLSearchParams, name: string, value: string): void {
  if (value) params.set(name, value);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
