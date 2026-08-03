import { useEffect, useMemo, useState } from "react";
import type { ApiClient } from "../api/client";
import { CurationEditor } from "../components/curation-editor";
import { CopyIcon } from "../components/icons";
import { formatDate } from "../components/image-grid";
import { generationFailureSummary } from "../components/generation-issue";
import { PromptDiff } from "../components/prompt-diff";
import { RecordError, RecordLoading } from "../components/states";
import { GenerationStatusBadge } from "../components/status";
import { useApiResource } from "../hooks/use-api-resource";
import { Link } from "../router";
import type { PromptRevisionView } from "../types";

export function CreationDetailPage({ api, creationId }: { api: ApiClient; creationId: string }) {
  const resource = useApiResource(`creation:${creationId}`, (signal) =>
    api.creation(creationId, signal),
  );
  const [draftContent, setDraftContent] = useState("");
  const [basedOnRevisionId, setBasedOnRevisionId] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState<string>();
  const [selectedRevisionIds, setSelectedRevisionIds] = useState<string[]>([]);

  useEffect(() => {
    if (resource.data) {
      setDraftContent(resource.data.draft.content);
      setBasedOnRevisionId(resource.data.draft.basedOnRevisionId);
    }
  }, [resource.data]);

  const selectedRevisions = useMemo(
    () =>
      selectedRevisionIds
        .map((id) => resource.data?.revisions.find((revision) => revision.id === id))
        .filter((revision): revision is PromptRevisionView => Boolean(revision)),
    [resource.data, selectedRevisionIds],
  );

  if (resource.status === "loading" && !resource.data)
    return <RecordLoading title="Creation" label="Loading creation history" />;
  if (resource.status === "error")
    return <RecordError title="Creation" error={resource.error} onRetry={resource.reload} />;
  if (!resource.data) return null;

  const creation = resource.data;
  const saveDraft = async () => {
    setDraftMessage(undefined);
    try {
      await api.saveDraft(creationId, {
        expectedContentSha256: creation.draft.contentSha256,
        content: draftContent,
        basedOnRevisionId,
      });
      setDraftMessage("Draft saved.");
      resource.reload();
    } catch (error) {
      setDraftMessage(error instanceof Error ? error.message : "Draft could not be saved.");
    }
  };
  const toggleRevision = (id: string) => {
    setSelectedRevisionIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current.slice(-1), id],
    );
  };
  const invocation = `Use $generate-and-archive for Creation ${creation.id}. Read the current Prompt Draft and selected Reference Images, then archive every output.`;

  return (
    <div className="page detail-page">
      <header className="detail-hero">
        <div>
          <span className="eyebrow">Creation / {creation.id.slice(0, 8)}</span>
          <h1>{creation.title || "Untitled creation"}</h1>
          <p>{creation.note || "No curation note has been added."}</p>
        </div>
        <dl className="hero-facts">
          <div>
            <dt>Status</dt>
            <dd>{creation.status}</dd>
          </div>
          <div>
            <dt>Generations</dt>
            <dd>{creation.generationCount}</dd>
          </div>
          <div>
            <dt>Images</dt>
            <dd>{creation.imageCount}</dd>
          </div>
        </dl>
      </header>

      <div className="creation-layout">
        <div className="creation-main">
          <section className="content-section draft-section">
            <header>
              <div>
                <span className="eyebrow">Mutable working copy</span>
                <h2>Prompt Draft</h2>
              </div>
              <span className={creation.draft.externalEdit ? "warning-chip" : "revision-chip"}>
                {creation.draft.externalEdit
                  ? "External edit detected"
                  : `Based on ${basedOnRevisionId?.slice(0, 8) ?? "root"}`}
              </span>
            </header>
            {creation.draft.externalEdit && (
              <p className="inline-warning" role="alert">
                The draft changed outside this session. Reload before saving to avoid overwriting
                it.
              </p>
            )}
            <label className="sr-only" htmlFor="prompt-draft">
              Prompt Draft content
            </label>
            <textarea
              id="prompt-draft"
              className="prompt-editor"
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              spellCheck="true"
            />
            <footer>
              <span>{draftContent.length.toLocaleString()} characters</span>
              {draftMessage && <span role="status">{draftMessage}</span>}
              <button
                className="button button--primary"
                disabled={creation.draft.externalEdit}
                onClick={() => void saveDraft()}
              >
                Save Draft
              </button>
            </footer>
          </section>

          <section className="content-section">
            <header>
              <div>
                <span className="eyebrow">Single-parent lineage</span>
                <h2>Prompt History</h2>
              </div>
              <span className="section-count">{creation.revisions.length} revisions</span>
            </header>
            {selectedRevisions.length === 2 && (
              <PromptDiff
                before={selectedRevisions[0]!.prompt}
                after={selectedRevisions[1]!.prompt}
              />
            )}
            <ol className="revision-list">
              {linearizeRevisions(creation.revisions).map(({ revision, depth }, index) => (
                <li key={revision.id} className={`revision-depth-${Math.min(depth, 8)}`}>
                  <span className="revision-node" aria-hidden="true" />
                  <label className="revision-select">
                    <input
                      type="checkbox"
                      checked={selectedRevisionIds.includes(revision.id)}
                      onChange={() => toggleRevision(revision.id)}
                    />
                    <span className="sr-only">Select revision for comparison</span>
                  </label>
                  <div>
                    <strong>R{String(index + 1).padStart(3, "0")}</strong>
                    <code>{revision.id.slice(0, 12)}</code>
                  </div>
                  <p>{revision.changeInstruction || "Explicit prompt checkpoint"}</p>
                  <time dateTime={revision.createdAt}>{formatDate(revision.createdAt)}</time>
                  <button
                    className="text-button"
                    onClick={() => {
                      setDraftContent(revision.prompt);
                      setBasedOnRevisionId(revision.id);
                    }}
                  >
                    Restore to Draft
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <section className="content-section">
            <header>
              <div>
                <span className="eyebrow">Immutable tool calls</span>
                <h2>Generation Timeline</h2>
              </div>
              <span className="section-count">{creation.generations.length} calls</span>
            </header>
            <ol className="timeline">
              {[...creation.generations]
                .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
                .map((generation) => (
                  <li key={generation.id}>
                    <div className="timeline-marker" aria-hidden="true" />
                    <div className="timeline-heading">
                      <Link to={`/generations/${generation.id}`}>
                        <strong>{formatDate(generation.startedAt)}</strong>
                        <code>{generation.id.slice(0, 12)}</code>
                      </Link>
                      <GenerationStatusBadge
                        status={generation.status}
                        outcomeKnown={generation.outcomeKnown}
                      />
                    </div>
                    <p>
                      {generation.outputs.length} outputs · {generation.references.length}{" "}
                      references{generation.replayOfGenerationId ? " · replay" : ""}
                    </p>
                    {generation.status !== "succeeded" && (
                      <div className="timeline-issue" role="status">
                        <span>{generationFailureSummary(generation)}</span>
                        <Link to={`/generations/${generation.id}`}>Review Prompt</Link>
                      </div>
                    )}
                    {generation.outputs.length > 0 && (
                      <div className="timeline-images">
                        {generation.outputs.map((output) => (
                          <Link key={output.assetSha256} to={`/images/${output.assetSha256}`}>
                            <img
                              src={`/api/v1/images/${output.assetSha256}/content?variant=thumbnail`}
                              alt={`Output ${output.index + 1}`}
                              loading="lazy"
                            />
                          </Link>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
            </ol>
          </section>
        </div>

        <aside className="creation-inspector">
          <CurationEditor
            kind="creation"
            value={{
              title: creation.title,
              tags: creation.tags,
              favorite: creation.favorite,
              note: creation.note,
              status: creation.status,
              entityRevision: creation.entityRevision,
            }}
            onSave={async (request) => {
              await api.patchCreationCuration(creation.id, request);
              resource.reload();
            }}
          />
          <section className="invocation-card">
            <span className="eyebrow">Codex handoff</span>
            <h2>Prepare generation</h2>
            <p>The Web UI never starts image generation. Copy this instruction into Codex.</p>
            <pre>{invocation}</pre>
            <button
              className="button"
              onClick={() => void navigator.clipboard.writeText(invocation)}
            >
              <CopyIcon /> Copy instruction
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}

function linearizeRevisions(
  revisions: PromptRevisionView[],
): Array<{ revision: PromptRevisionView; depth: number }> {
  const depthById = new Map<string, number>();
  const remaining = [...revisions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return remaining.map((revision) => {
    const depth = revision.parentRevisionId
      ? (depthById.get(revision.parentRevisionId) ?? 0) + 1
      : 0;
    depthById.set(revision.id, depth);
    return { revision, depth };
  });
}
