import type { GenerationView } from "../types";
import { Link } from "../router";

type GenerationLike = Pick<
  GenerationView,
  "id" | "creationId" | "status" | "outcomeKnown" | "error"
>;

export type ModerationStage = "input" | "output" | "unknown";

export interface GenerationErrorView {
  code: string;
  summary: string;
  retryable: boolean | null;
  moderation: {
    stage: ModerationStage;
    categories: string[];
  } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseStage(value: unknown): ModerationStage {
  return value === "input" || value === "output" || value === "unknown" ? value : "unknown";
}

/**
 * Keep the UI compatible with both structured Phase 8 records and older generic error objects.
 * Unknown provider fields are deliberately ignored at this boundary.
 */
export function readGenerationError(value: unknown): GenerationErrorView | null {
  if (!isRecord(value)) return null;
  const code = asNonEmptyString(value.code);
  const summary = asNonEmptyString(value.summary);
  const moderationValue = isRecord(value.moderation) ? value.moderation : null;
  const categories =
    moderationValue && Array.isArray(moderationValue.categories)
      ? moderationValue.categories.filter(
          (category): category is string =>
            typeof category === "string" && category.trim().length > 0,
        )
      : [];

  return {
    code: code ?? "GENERATION_FAILED",
    summary: summary ?? "The image generation tool reported a failure.",
    retryable: typeof value.retryable === "boolean" ? value.retryable : null,
    moderation: moderationValue
      ? { stage: parseStage(moderationValue.stage), categories: [...new Set(categories)] }
      : null,
  };
}

export function generationFailureSummary(generation: GenerationLike): string {
  const error = readGenerationError(generation.error);
  if (error) return error.summary;
  if (generation.status === "interrupted" || !generation.outcomeKnown) {
    return "The invocation result was not available; outcome is unknown.";
  }
  return "The image generation tool reported a failure before producing an output.";
}

function categoryGuidance(category: string): string {
  const normalized = category.toLowerCase();
  if (normalized.includes("sexual")) {
    return "Review sexualized framing, exposed-body emphasis, and adult-content cues in the prompt.";
  }
  if (normalized.includes("violence") || normalized.includes("graphic")) {
    return "Review violent action, injury, blood, and graphic-detail cues in the prompt.";
  }
  if (normalized.includes("hate") || normalized.includes("harassment")) {
    return "Review targeted-group references, slurs, and degrading or abusive framing in the prompt.";
  }
  if (normalized.includes("self") && normalized.includes("harm")) {
    return "Review self-harm, suicide, or instructions for causing injury in the prompt.";
  }
  return "Review the prompt against the image tool's guidance for this category.";
}

export function GenerationErrorPanel({
  generation,
  showReviewAction = true,
}: {
  generation: GenerationLike;
  showReviewAction?: boolean;
}) {
  if (generation.status === "interrupted" || !generation.outcomeKnown) {
    return (
      <section className="generation-warning generation-warning--interrupted" role="alert">
        <span className="eyebrow">Interrupted invocation</span>
        <h2>Outcome unknown</h2>
        <p>{generationFailureSummary(generation)}</p>
        <p className="warning-footnote">
          Do not treat an interrupted invocation as a known safety or tool failure.
        </p>
        {showReviewAction && (
          <Link className="button" to={`/creations/${generation.creationId}`}>
            Review Prompt
          </Link>
        )}
      </section>
    );
  }

  if (generation.status !== "failed") return null;
  const error = readGenerationError(generation.error);
  const moderation = error?.moderation;
  const stage = moderation?.stage ?? null;
  const categories = moderation?.categories ?? [];
  const safetyRejection = error?.code === "IMAGE_GENERATION_SAFETY_REJECTED";

  return (
    <section
      className={`generation-warning generation-warning--failed${safetyRejection ? " generation-warning--safety" : ""}`}
      role="alert"
    >
      <span className="eyebrow">Known Generation failure</span>
      <h2>{safetyRejection ? "Safety review rejected this result" : "Generation failed"}</h2>
      <p>{generationFailureSummary(generation)}</p>
      {safetyRejection && (
        <p className="warning-footnote">
          This records the image tool's moderation result. An output-stage rejection does not by
          itself prove that the Prompt Draft violates policy.
        </p>
      )}
      <dl className="generation-error-facts">
        <div>
          <dt>Error code</dt>
          <dd>{error?.code ?? "GENERATION_FAILED"}</dd>
        </div>
        {stage && (
          <div>
            <dt>Moderation stage</dt>
            <dd>{stage}</dd>
          </div>
        )}
        {error?.retryable !== null && (
          <div>
            <dt>Retryable</dt>
            <dd>{error?.retryable ? "Yes" : "No"}</dd>
          </div>
        )}
      </dl>
      {categories.length > 0 && (
        <div className="generation-error-categories">
          <strong>Category guidance</strong>
          <ul>
            {categories.map((category) => (
              <li key={category}>
                <span className="category-label">{category}</span>
                <span>{categoryGuidance(category)}</span>
              </li>
            ))}
          </ul>
          <p className="warning-footnote">
            These are category-level review suggestions, not confirmed trigger phrases.
          </p>
        </div>
      )}
      {showReviewAction && (
        <div className="button-row">
          <Link className="button button--primary" to={`/creations/${generation.creationId}`}>
            Review Prompt
          </Link>
          <Link className="button" to={`/creations/${generation.creationId}#prompt-draft`}>
            Edit Prompt Draft
          </Link>
        </div>
      )}
    </section>
  );
}
