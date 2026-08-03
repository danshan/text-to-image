import { ApiError } from "../api/client";
import type { LibraryInitializationRequired } from "../types";
import type { ReactNode } from "react";

export function LoadingState({ label = "Loading library records" }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="loading-index">EXPOSING</span>
      <div className="loading-lines" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const apiError = error instanceof ApiError ? error : undefined;
  const isSessionError = apiError?.body.code === "SESSION_TOKEN_INVALID";
  return (
    <section className="state-panel state-panel--error" role="alert">
      <span className="eyebrow">Service diagnostic</span>
      <h2>{isSessionError ? "The local service restarted" : "This record could not be exposed"}</h2>
      <p>
        {apiError?.body.message ??
          (error instanceof Error ? error.message : "An unknown local service error occurred.")}
      </p>
      {apiError?.body.recoveryHint && <p className="recovery-hint">{apiError.body.recoveryHint}</p>}
      {apiError?.body.correlationId && <code>Correlation: {apiError.body.correlationId}</code>}
      <div className="button-row">
        {isSessionError && (
          <button className="button button--primary" onClick={() => window.location.reload()}>
            Reload application
          </button>
        )}
        {onRetry && (
          <button className="button" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </section>
  );
}

export function LibraryInitializationState({
  initialization,
}: {
  initialization: LibraryInitializationRequired;
}) {
  return (
    <section className="state-panel state-panel--setup" role="status">
      <span className="eyebrow">First-run setup</span>
      <h1>Initialize the local Library</h1>
      <p>
        The configured Library does not contain <code>library.json</code>. No directory or cache was
        created automatically.
      </p>
      <div className="setup-detail">
        <span>Resolved Library path</span>
        <code>{initialization.libraryRoot}</code>
      </div>
      <pre className="setup-command">
        <code>{initialization.initCommand}</code>
      </pre>
      <p>Run this command in the repository, then restart the local service and reload the page.</p>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="state-panel state-panel--empty">
      <span className="registration-mark" aria-hidden="true">
        +
      </span>
      <span className="eyebrow">No contact sheets</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}

export function PageSkeleton() {
  return (
    <div className="skeleton-grid" aria-label="Loading images" role="status">
      {Array.from({ length: 8 }, (_, index) => (
        <div className={`skeleton-card skeleton-card--${(index % 3) + 1}`} key={index} />
      ))}
    </div>
  );
}

export function RecordLoading({ title, label }: { title: string; label: string }) {
  return (
    <div className="page">
      <header className="page-heading">
        <span className="eyebrow">Opening local record</span>
        <h1>{title}</h1>
      </header>
      <LoadingState label={label} />
    </div>
  );
}

export function RecordError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <div className="page">
      <header className="page-heading">
        <span className="eyebrow">Local record unavailable</span>
        <h1>{title}</h1>
      </header>
      <ErrorState error={error} onRetry={onRetry} />
    </div>
  );
}
