import type { ApiClient } from "../api/client";
import { ImageGrid } from "../components/image-grid";
import { EmptyState, ErrorState, PageSkeleton } from "../components/states";
import { useApiResource } from "../hooks/use-api-resource";

export function ReferencesPage({ api, search }: { api: ApiClient; search: string }) {
  const resource = useApiResource(`references:${search}`, (signal) =>
    api.references(search, signal),
  );
  return (
    <div className="page">
      <header className="page-heading">
        <span className="eyebrow">Archive / visual inputs</span>
        <h1>References</h1>
        <p>Imported images and assets reused as generation references.</p>
      </header>
      {resource.status === "loading" && !resource.data && <PageSkeleton />}
      {resource.status === "error" && (
        <ErrorState error={resource.error} onRetry={resource.reload} />
      )}
      {resource.data && resource.data.items.length > 0 && (
        <ImageGrid items={resource.data.items} api={api} onMutation={resource.reload} />
      )}
      {resource.data?.items.length === 0 && (
        <EmptyState
          title="No reference images yet"
          description="Import an image into the Library inbox, then attach it to a generation with explicit roles."
        />
      )}
    </div>
  );
}
