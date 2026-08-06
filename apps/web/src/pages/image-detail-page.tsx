import type { ApiClient } from "../api/client";
import { CurationEditor } from "../components/curation-editor";
import { formatDate } from "../components/image-grid";
import { RecordError, RecordLoading } from "../components/states";
import { GenerationStatusBadge } from "../components/status";
import { PurgeDangerZone } from "../components/purge-danger-zone";
import { useApiResource } from "../hooks/use-api-resource";
import { creationProvenancePath, Link } from "../router";

export function ImageDetailPage({ api, sha256 }: { api: ApiClient; sha256: string }) {
  const resource = useApiResource(`image:${sha256}`, (signal) => api.image(sha256, signal));
  if (resource.status === "loading" && !resource.data)
    return <RecordLoading title="Image Asset" label="Loading image provenance" />;
  if (resource.status === "error")
    return <RecordError title="Image Asset" error={resource.error} onRetry={resource.reload} />;
  if (!resource.data) return null;
  const image = resource.data;
  const alt = image.note || `Generated image from ${image.creationTitle || "untitled creation"}`;

  return (
    <div className="page detail-page">
      <header className="page-heading">
        <span className="eyebrow">Image Asset / immutable content</span>
        <h1>{image.creationTitle || "Imported reference"}</h1>
        <code className="long-id">sha256:{image.sha256}</code>
      </header>
      <div className="image-detail-layout">
        <div className="image-stage">
          <img src={`/api/v1/images/${image.sha256}/content?variant=original`} alt={alt} />
          <dl className="image-facts">
            <div>
              <dt>Dimensions</dt>
              <dd>
                {image.width ?? "Unknown"} × {image.height ?? "Unknown"}
              </dd>
            </div>
            <div>
              <dt>Media</dt>
              <dd>{image.mediaType}</dd>
            </div>
            <div>
              <dt>Archive date</dt>
              <dd>{formatDate(image.createdAt)}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{image.imported ? "Imported" : "Generated output"}</dd>
            </div>
          </dl>
        </div>
        <aside className="detail-inspector">
          <CurationEditor
            kind="image"
            value={{
              tags: image.tags,
              favorite: image.favorite,
              rating: image.rating,
              note: image.note,
              hidden: image.hidden,
              entityRevision: image.entityRevision,
            }}
            onSave={async (request) => {
              await api.patchImageCuration(image.sha256, request);
              resource.reload();
            }}
          />
          <section className="provenance-section">
            <span className="eyebrow">Provenance</span>
            <h2>Produced by</h2>
            {image.producingGeneration ? (
              <Link to={`/generations/${image.producingGeneration.id}`} className="relation-card">
                <div>
                  <code>{image.producingGeneration.id.slice(0, 12)}</code>
                  <GenerationStatusBadge
                    status={image.producingGeneration.status}
                    outcomeKnown={image.producingGeneration.outcomeKnown}
                  />
                </div>
                <span>{formatDate(image.producingGeneration.startedAt)}</span>
              </Link>
            ) : (
              <p className="muted-copy">Imported. No producing Generation exists.</p>
            )}
          </section>
          <section className="provenance-section">
            <span className="eyebrow">Reference edges</span>
            <h2>Used by {image.usedAsReference.length}</h2>
            {image.usedAsReference.length > 0 ? (
              <ol className="relation-list">
                {image.usedAsReference.map((relation) => (
                  <li key={`${relation.generationId}:${relation.creationId}`}>
                    <div className="relation-links">
                      <Link to={`/generations/${relation.generationId}`}>
                        <code>{relation.generationId.slice(0, 10)}</code>
                        <span>Generation</span>
                      </Link>
                      <Link
                        to={creationProvenancePath(
                          relation.creationId,
                          relation.promptRevisionId,
                          relation.generationId,
                        )}
                      >
                        <code>{relation.promptRevisionId.slice(0, 10)}</code>
                        <span>Prompt Revision</span>
                      </Link>
                    </div>
                    <p>{relation.roles.join(" · ")}</p>
                    {relation.guidance && <p>{relation.guidance}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted-copy">This asset has not been used as a Reference Image.</p>
            )}
          </section>
          <PurgeDangerZone api={api} kind="image" id={image.sha256} label={image.creationTitle} />
        </aside>
      </div>
    </div>
  );
}
