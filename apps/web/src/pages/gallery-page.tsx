import type { ApiClient } from "../api/client";
import { GalleryFilters } from "../components/gallery-filters";
import { GenerationIssuesRegion } from "../components/generation-issues-region";
import { ImageGrid } from "../components/image-grid";
import { EmptyState, ErrorState, PageSkeleton } from "../components/states";
import { useApiResource } from "../hooks/use-api-resource";
import { navigate } from "../router";
import {
  activeFilterCount,
  defaultGalleryQuery,
  parseGalleryQuery,
  serializeGalleryQuery,
} from "../state/gallery-query";

export function GalleryPage({ api, search }: { api: ApiClient; search: string }) {
  const query = parseGalleryQuery(search);
  const resource = useApiResource(`gallery:${search}`, (signal) => api.gallery(search, signal));
  const issuesResource = useApiResource("generation-issues", (signal) =>
    api.generationIssues(signal),
  );

  const updateQuery = (next: typeof query) => navigate(`/gallery${serializeGalleryQuery(next)}`);
  const isFiltered = Boolean(query.q || activeFilterCount(query));

  return (
    <div className="page gallery-page">
      <header className="page-heading page-heading--split">
        <div>
          <span className="eyebrow">Archive / visible outputs</span>
          <h1>Gallery</h1>
          <p>Immutable images, exposed as a working contact sheet.</p>
        </div>
        <div className="heading-controls">
          <GalleryFilters query={query} onChange={updateQuery} />
          <label className="sort-control">
            Sort<span className="sr-only"> gallery</span>
            <select
              value={query.sort}
              onChange={(event) =>
                updateQuery({ ...query, sort: event.target.value as typeof query.sort, cursor: "" })
              }
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="rating_desc">Rating, high to low</option>
            </select>
          </label>
        </div>
      </header>
      {resource.status === "loading" && !resource.data && <PageSkeleton />}
      {resource.status === "error" && (
        <ErrorState error={resource.error} onRetry={resource.reload} />
      )}
      <GenerationIssuesRegion
        issues={issuesResource.data?.items}
        status={issuesResource.status}
        error={issuesResource.error}
        onRetry={issuesResource.reload}
      />
      {resource.data && resource.data.items.length > 0 && (
        <>
          <div className="result-register">
            <span>{resource.data.page.total.toLocaleString()} frames</span>
            <span>DOM order matches chronology</span>
          </div>
          <ImageGrid items={resource.data.items} api={api} onMutation={resource.reload} />
          {resource.data.page.nextCursor && (
            <button
              className="button load-more"
              onClick={() =>
                updateQuery({ ...query, cursor: resource.data?.page.nextCursor ?? "" })
              }
            >
              Expose next sheet
            </button>
          )}
        </>
      )}
      {resource.data?.items.length === 0 && (
        <EmptyState
          title={
            isFiltered ? "No frames match this exposure" : "The archive has no visible outputs"
          }
          description={
            isFiltered
              ? "Adjust the active filters or clear the search. Hidden and imported images remain excluded unless selected."
              : "Generate and archive an image from Codex, then rebuild the index if needed."
          }
          action={
            isFiltered ? (
              <button className="button" onClick={() => updateQuery({ ...defaultGalleryQuery })}>
                Clear search and filters
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
