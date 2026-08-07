import { useEffect, useMemo, useState } from "react";
import type { ApiClient } from "../api/client";
import { CurationEditor } from "../components/curation-editor";
import { CopyIcon } from "../components/icons";
import { formatDate } from "../components/image-grid";
import { generationFailureSummary } from "../components/generation-issue";
import { PromptDiff } from "../components/prompt-diff";
import { PurgeDangerZone } from "../components/purge-danger-zone";
import { RecordError, RecordLoading } from "../components/states";
import { GenerationStatusBadge } from "../components/status";
import { useApiResource } from "../hooks/use-api-resource";
import { creationProvenancePath, Link, navigate, useBrowserLocation } from "../router";
import type { GenerationView, PromptRevisionView } from "../types";

export function CreationDetailPage({ api, creationId }: { api: ApiClient; creationId: string }) {
  const location = useBrowserLocation();
  const resource = useApiResource(`creation:${creationId}`, (signal) =>
    api.creation(creationId, signal),
  );
  const [draftContent, setDraftContent] = useState("");
  const [basedOnRevisionId, setBasedOnRevisionId] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState<string>();
  const [compareRevisionIds, setCompareRevisionIds] = useState<string[]>([]);

  useEffect(() => {
    if (resource.data) {
      setDraftContent(resource.data.draft.content);
      setBasedOnRevisionId(resource.data.draft.basedOnRevisionId);
    }
  }, [resource.data]);

  const selectedRevisions = useMemo(
    () =>
      compareRevisionIds
        .map((id) => resource.data?.revisions.find((revision) => revision.id === id))
        .filter((revision): revision is PromptRevisionView => Boolean(revision)),
    [compareRevisionIds, resource.data],
  );
  const revisionHistory = useMemo(
    () => linearizeRevisions(resource.data?.revisions ?? []),
    [resource.data],
  );
  const generations = useMemo(
    () =>
      [...(resource.data?.generations ?? [])].sort((a, b) =>
        b.startedAt.localeCompare(a.startedAt),
      ),
    [resource.data],
  );
  const focus = useMemo(() => {
    const revisions = resource.data?.revisions ?? [];
    const parameters = new URLSearchParams(location.search);
    const requestedGeneration = resource.data?.generations.find(
      (generation) => generation.id === parameters.get("generation"),
    );
    const requestedRevision = revisions.find(
      (revision) => revision.id === parameters.get("revision"),
    );
    if (requestedGeneration) {
      return {
        generationId: requestedGeneration.id,
        revisionId: requestedGeneration.promptRevisionId,
      };
    }
    if (requestedRevision) return { generationId: null, revisionId: requestedRevision.id };

    const latestGeneration = generations[0];
    const latestRevision = revisionHistory.at(-1)?.revision;
    return {
      generationId: latestGeneration?.id ?? null,
      revisionId: latestGeneration?.promptRevisionId ?? latestRevision?.id ?? null,
    };
  }, [generations, location.search, resource.data, revisionHistory]);

  useEffect(() => {
    const parameters = new URLSearchParams(location.search);
    const generationId = parameters.get("generation");
    const revisionId = parameters.get("revision");
    const latestLinkedGeneration = revisionId
      ? generations.find((generation) => generation.promptRevisionId === revisionId)
      : null;
    const targetId = generationId
      ? `generation-${generationId}`
      : latestLinkedGeneration
        ? `generation-${latestLinkedGeneration.id}`
        : revisionId
          ? `revision-${revisionId}`
          : null;
    if (!targetId || !resource.data) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView?.({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [generations, location.search, resource.data]);

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
    setCompareRevisionIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current.slice(-1), id],
    );
  };
  const focusRevision = (id: string) => navigate(creationProvenancePath(creation.id, id));
  const focusGeneration = (generation: GenerationView) =>
    navigate(creationProvenancePath(creation.id, generation.promptRevisionId, generation.id));
  const linkedGenerationIds = new Set(
    generations
      .filter((generation) => generation.promptRevisionId === focus.revisionId)
      .map((generation) => generation.id),
  );
  const revisionLabelById = new Map(
    revisionHistory.map(({ revision }, index) => [
      revision.id,
      `R${String(index + 1).padStart(3, "0")}`,
    ]),
  );
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
              {revisionHistory.map(({ revision, depth }, index) => {
                const relatedGenerations = generations.filter(
                  (generation) => generation.promptRevisionId === revision.id,
                );
                const focused = focus.revisionId === revision.id;
                return (
                  <li
                    id={`revision-${revision.id}`}
                    key={revision.id}
                    className={`revision-item revision-depth-${Math.min(depth, 8)}${
                      focused ? " is-focused" : ""
                    }`}
                  >
                    <span className="revision-node" aria-hidden="true" />
                    <button
                      className="revision-focus"
                      aria-pressed={focused}
                      onClick={() => focusRevision(revision.id)}
                    >
                      <span className="revision-title">
                        <strong>R{String(index + 1).padStart(3, "0")}</strong>
                        <code>{revision.id.slice(0, 12)}</code>
                      </span>
                      <span>{revision.changeInstruction || "Explicit prompt checkpoint"}</span>
                      <time dateTime={revision.createdAt}>{formatDate(revision.createdAt)}</time>
                      <span className="relation-count">
                        {relatedGenerations.length} linked Generation
                        {relatedGenerations.length === 1 ? "" : "s"}
                      </span>
                    </button>
                    <div className="revision-actions">
                      <label className="revision-compare">
                        <input
                          type="checkbox"
                          checked={compareRevisionIds.includes(revision.id)}
                          onChange={() => toggleRevision(revision.id)}
                        />
                        <span>Compare</span>
                      </label>
                      <button
                        className="text-button"
                        onClick={() => {
                          setDraftContent(revision.prompt);
                          setBasedOnRevisionId(revision.id);
                        }}
                      >
                        Restore to Draft
                      </button>
                    </div>
                    {focused && (
                      <div className="revision-generation-groups">
                        <h3>Linked Generations</h3>
                        {relatedGenerations.length > 0 ? (
                          <ol>
                            {relatedGenerations.map((generation) => (
                              <li
                                key={generation.id}
                                className={focus.generationId === generation.id ? "is-active" : ""}
                              >
                                <button
                                  className="linked-generation"
                                  aria-pressed={focus.generationId === generation.id}
                                  onClick={() => focusGeneration(generation)}
                                >
                                  <span>
                                    <code>{generation.id.slice(0, 12)}</code>
                                    <small>
                                      {providerLabel(generation.provider)} ·{" "}
                                      {generation.tool.model || "Unknown model"}
                                    </small>
                                    <time dateTime={generation.startedAt}>
                                      {formatDate(generation.startedAt)}
                                    </time>
                                  </span>
                                  <GenerationStatusBadge
                                    status={generation.status}
                                    outcomeKnown={generation.outcomeKnown}
                                  />
                                </button>
                                {generation.references.length > 0 ? (
                                  <ol className="reference-usage-list">
                                    {generation.references.map((reference, referenceIndex) => (
                                      <li key={`${reference.assetSha256}:${referenceIndex}`}>
                                        <Link to={`/images/${reference.assetSha256}`}>
                                          <img
                                            src={`/api/v1/images/${reference.assetSha256}/content?variant=thumbnail`}
                                            alt={`Reference image ${referenceIndex + 1}`}
                                            loading="lazy"
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
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="muted-copy">This Prompt Revision has not been generated.</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
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
              {generations.map((generation) => {
                const linked = linkedGenerationIds.has(generation.id);
                const focused = focus.generationId === generation.id;
                return (
                  <li
                    id={`generation-${generation.id}`}
                    key={generation.id}
                    className={`${linked ? "is-related" : "is-muted"}${
                      focused ? " is-focused" : ""
                    }`}
                  >
                    <div className="timeline-marker" aria-hidden="true" />
                    <div className="timeline-heading">
                      <button
                        className="timeline-focus"
                        aria-pressed={focused}
                        onClick={() => focusGeneration(generation)}
                      >
                        <strong>{formatDate(generation.startedAt)}</strong>
                        <code>{generation.id.slice(0, 12)}</code>
                      </button>
                      <span className="revision-chip">
                        {providerLabel(generation.provider)} ·{" "}
                        {generation.tool.model || "Unknown model"}
                      </span>
                      <GenerationStatusBadge
                        status={generation.status}
                        outcomeKnown={generation.outcomeKnown}
                      />
                    </div>
                    <div className="timeline-relations">
                      <Link to={creationProvenancePath(creation.id, generation.promptRevisionId)}>
                        Prompt {revisionLabelById.get(generation.promptRevisionId) ?? "Revision"}
                      </Link>
                      <Link to={`/generations/${generation.id}`}>Open details</Link>
                    </div>
                    <p className="generation-summary">
                      {providerLabel(generation.provider)} ·{" "}
                      {generation.tool.model || "Unknown model"} · {generation.outputs.length}{" "}
                      outputs · {generation.references.length} references
                      {generation.replayOfGenerationId ? " · replay" : ""}
                    </p>
                    {generation.status !== "succeeded" && (
                      <div className="timeline-issue" role="status">
                        <span>{generationFailureSummary(generation)}</span>
                        <Link to={`/generations/${generation.id}`}>Review Prompt</Link>
                      </div>
                    )}
                    {generation.references.length > 0 && (
                      <ol className="timeline-references">
                        {generation.references.map((reference, referenceIndex) => (
                          <li key={`${reference.assetSha256}:${referenceIndex}`}>
                            <Link to={`/images/${reference.assetSha256}`}>
                              <img
                                src={`/api/v1/images/${reference.assetSha256}/content?variant=thumbnail`}
                                alt={`Reference image ${referenceIndex + 1}`}
                                loading="lazy"
                              />
                              <span>{reference.roles.join(" · ")}</span>
                            </Link>
                          </li>
                        ))}
                      </ol>
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
                );
              })}
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
          <PurgeDangerZone api={api} kind="creation" id={creation.id} label={creation.title} />
        </aside>
      </div>
    </div>
  );
}

function providerLabel(provider: string | null): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "xai") return "Grok / xAI";
  return provider || "Unknown provider";
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
