import type { ApiClient } from "../api/client";
import { formatDate } from "../components/image-grid";
import { ArrowIcon, StarIcon } from "../components/icons";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { useApiResource } from "../hooks/use-api-resource";
import { Link, navigate } from "../router";

export function CreationsPage({ api, search }: { api: ApiClient; search: string }) {
  const params = new URLSearchParams(search);
  const status = params.get("status") === "shelved" ? "shelved" : "active";
  const requestSearch = `?status=${status}`;
  const resource = useApiResource(`creations:${requestSearch}`, (signal) =>
    api.creations(requestSearch, signal),
  );

  return (
    <div className="page">
      <header className="page-heading page-heading--split">
        <div>
          <span className="eyebrow">Archive / creative threads</span>
          <h1>Creations</h1>
          <p>Long-lived intent, prompt branches and generation histories.</p>
        </div>
        <div className="segmented-control" aria-label="Creation status filter">
          <button
            aria-pressed={status === "active"}
            onClick={() => navigate("/creations?status=active")}
          >
            Active
          </button>
          <button
            aria-pressed={status === "shelved"}
            onClick={() => navigate("/creations?status=shelved")}
          >
            Shelved
          </button>
        </div>
      </header>
      {resource.status === "loading" && !resource.data && (
        <LoadingState label="Loading creation threads" />
      )}
      {resource.status === "error" && (
        <ErrorState error={resource.error} onRetry={resource.reload} />
      )}
      {resource.data && resource.data.items.length > 0 && (
        <ol className="creation-list">
          {resource.data.items.map((creation, index) => (
            <li key={creation.id}>
              <Link to={`/creations/${creation.id}`} className="creation-row">
                <span className="creation-index">CR—{String(index + 1).padStart(3, "0")}</span>
                <div className="creation-title">
                  <strong>{creation.title || "Untitled creation"}</strong>
                  <span>{creation.tags.join(" · ") || "No tags"}</span>
                </div>
                <div className="creation-count">
                  <strong>{creation.imageCount}</strong>
                  <span>images</span>
                </div>
                <div className="creation-count">
                  <strong>{creation.generationCount}</strong>
                  <span>generations</span>
                </div>
                <time dateTime={creation.createdAt}>{formatDate(creation.createdAt)}</time>
                {creation.favorite && <StarIcon filled aria-label="Favorite" />}
                <ArrowIcon />
              </Link>
            </li>
          ))}
        </ol>
      )}
      {resource.data?.items.length === 0 && (
        <EmptyState
          title={`No ${status} creations`}
          description={
            status === "active"
              ? "Create a creative thread with assetctl before preparing its first prompt."
              : "Shelved creations remain reversible and will appear here."
          }
        />
      )}
    </div>
  );
}
