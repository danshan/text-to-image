import type { ApiClient } from "../api/client";
import { GenerationErrorPanel } from "../components/generation-issue";
import { formatDate } from "../components/image-grid";
import { RecordError, RecordLoading } from "../components/states";
import { GenerationStatusBadge } from "../components/status";
import { useApiResource } from "../hooks/use-api-resource";
import { Link } from "../router";

export function GenerationDetailPage({
  api,
  generationId,
}: {
  api: ApiClient;
  generationId: string;
}) {
  const resource = useApiResource(`generation:${generationId}`, (signal) =>
    api.generation(generationId, signal),
  );
  if (resource.status === "loading" && !resource.data)
    return <RecordLoading title="Generation" label="Loading generation record" />;
  if (resource.status === "error")
    return <RecordError title="Generation" error={resource.error} onRetry={resource.reload} />;
  if (!resource.data) return null;
  const generation = resource.data;

  return (
    <div className="page detail-page generation-page">
      <header className="detail-hero">
        <div>
          <span className="eyebrow">Generation / immutable tool call</span>
          <h1>{formatDate(generation.startedAt)}</h1>
          <code>{generation.id}</code>
        </div>
        <GenerationStatusBadge status={generation.status} outcomeKnown={generation.outcomeKnown} />
      </header>
      {generation.status !== "succeeded" && <GenerationErrorPanel generation={generation} />}
      <div className="generation-layout">
        <div className="generation-main">
          <section className="content-section">
            <header>
              <div>
                <span className="eyebrow">Actual tool input</span>
                <h2>Prompt Revision</h2>
              </div>
              <code>{generation.promptRevisionId.slice(0, 12)}</code>
            </header>
            {generation.prompt ? (
              <>
                <p className="change-instruction">
                  {generation.prompt.changeInstruction || "No Change Instruction recorded."}
                </p>
                <pre className="actual-prompt">{generation.prompt.prompt}</pre>
                {generation.prompt.parentRevisionId && (
                  <p className="relation-note">
                    Parent revision: <code>{generation.prompt.parentRevisionId}</code>
                  </p>
                )}
              </>
            ) : (
              <p className="muted-copy">Prompt content is unavailable in this bounded view.</p>
            )}
          </section>
          <section className="content-section">
            <header>
              <div>
                <span className="eyebrow">Ordered results</span>
                <h2>Outputs</h2>
              </div>
              <span className="section-count">{generation.outputs.length}</span>
            </header>
            {generation.outputs.length > 0 ? (
              <ol className="output-strip">
                {generation.outputs.map((output) => (
                  <li key={output.assetSha256}>
                    <Link to={`/images/${output.assetSha256}`}>
                      <img
                        src={`/api/v1/images/${output.assetSha256}/content?variant=thumbnail`}
                        alt={`Generation output ${output.index + 1}`}
                      />
                      <span>Output {output.index + 1}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted-copy">This Generation has no archived outputs.</p>
            )}
          </section>
          <section className="content-section">
            <header>
              <div>
                <span className="eyebrow">Visual inputs</span>
                <h2>Reference Images</h2>
              </div>
              <span className="section-count">{generation.references.length}</span>
            </header>
            {generation.references.length > 0 ? (
              <ol className="reference-strip">
                {generation.references.map((reference, index) => (
                  <li key={`${reference.assetSha256}:${index}`}>
                    <Link to={`/images/${reference.assetSha256}`}>
                      <img
                        src={`/api/v1/images/${reference.assetSha256}/content?variant=thumbnail`}
                        alt={`Reference image ${index + 1}`}
                      />
                    </Link>
                    <div>
                      <strong>{reference.roles.join(" · ")}</strong>
                      <p>{reference.guidance || "No guidance recorded."}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted-copy">No Reference Images were supplied.</p>
            )}
          </section>
        </div>
        <aside className="generation-inspector">
          <section>
            <span className="eyebrow">Relations</span>
            <h2>Creation</h2>
            <Link className="relation-card" to={`/creations/${generation.creationId}`}>
              <code>{generation.creationId}</code>
              <span>Open creative thread</span>
            </Link>
          </section>
          <section>
            <span className="eyebrow">Tool record</span>
            <h2>Invocation</h2>
            <dl className="stacked-facts">
              <div>
                <dt>Name</dt>
                <dd>{generation.tool.name || "Unknown"}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{generation.tool.model || "Unknown"}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{formatDate(generation.startedAt)}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{generation.completedAt ? formatDate(generation.completedAt) : "Unknown"}</dd>
              </div>
            </dl>
            <pre className="json-snippet">
              {JSON.stringify(generation.tool.parameters, null, 2)}
            </pre>
          </section>
          {generation.replayOfGenerationId && (
            <section>
              <span className="eyebrow">Replay provenance</span>
              <h2>Replayed from</h2>
              <Link
                className="relation-card"
                to={`/generations/${generation.replayOfGenerationId}`}
              >
                <code>{generation.replayOfGenerationId}</code>
              </Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
