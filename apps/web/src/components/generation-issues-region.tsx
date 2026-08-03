import type { GenerationIssue } from "../types";
import { formatDate } from "./image-grid";
import { readGenerationError } from "./generation-issue";
import { GenerationStatusBadge } from "./status";
import { Link } from "../router";

function issueSummary(issue: GenerationIssue): string {
  const error = readGenerationError(issue.error);
  if (error) return error.summary;
  return issue.status === "interrupted"
    ? "The invocation result was not available; outcome is unknown."
    : "The image generation tool reported a failure before producing an output.";
}

export function GenerationIssuesRegion({
  issues,
  status,
  error,
  onRetry,
}: {
  issues?: GenerationIssue[];
  status: "loading" | "success" | "error";
  error?: unknown;
  onRetry: () => void;
}) {
  if (status === "loading" && !issues) {
    return (
      <section
        className="generation-issues generation-issues--loading"
        aria-label="Generation Issues"
      >
        <span className="eyebrow">Generation Issues</span>
        <p role="status">Checking the latest Generation outcomes…</p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="generation-issues generation-issues--error" role="status">
        <span className="eyebrow">Generation Issues</span>
        <p>Issue history could not be loaded.</p>
        <button className="text-button" onClick={onRetry}>
          Try again
        </button>
        {error instanceof Error && <span className="sr-only">{error.message}</span>}
      </section>
    );
  }

  if (!issues || issues.length === 0) return null;

  return (
    <section className="generation-issues" aria-labelledby="generation-issues-heading">
      <header className="generation-issues-heading">
        <div>
          <span className="eyebrow">Attention / latest outcomes</span>
          <h2 id="generation-issues-heading">Generation Issues</h2>
        </div>
        <span className="section-count">{issues.length}</span>
      </header>
      <ul className="generation-issues-list">
        {issues.map((issue) => {
          const errorRecord = readGenerationError(issue.error);
          const moderation = errorRecord?.moderation;
          const safety = errorRecord?.code === "IMAGE_GENERATION_SAFETY_REJECTED";
          return (
            <li key={issue.generationId} className="generation-issue-row">
              <div className="generation-issue-main">
                <div className="generation-issue-title">
                  <Link to={`/creations/${issue.creationId}`}>
                    {issue.creationTitle || "Untitled creation"}
                  </Link>
                  <GenerationStatusBadge status={issue.status} outcomeKnown={issue.outcomeKnown} />
                </div>
                <p>{issueSummary(issue)}</p>
                {safety && (
                  <p className="generation-issue-safety">
                    {moderation?.stage === "output"
                      ? "Output moderation rejected the generated result; this does not by itself prove a Prompt violation."
                      : "The image tool recorded a safety moderation rejection; review the Prompt Revision before editing the Draft."}
                  </p>
                )}
                {moderation && (
                  <div className="generation-issue-meta">
                    <span>Stage: {moderation.stage}</span>
                    {moderation.categories.length > 0 && (
                      <span>Categories: {moderation.categories.join(", ")}</span>
                    )}
                  </div>
                )}
              </div>
              <time dateTime={issue.completedAt}>{formatDate(issue.completedAt)}</time>
              <div className="generation-issue-actions">
                <Link to={`/generations/${issue.generationId}`}>Review Prompt</Link>
                <Link to={`/creations/${issue.creationId}#prompt-draft`}>Edit Draft</Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
