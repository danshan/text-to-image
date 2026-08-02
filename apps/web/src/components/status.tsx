import type { GenerationStatus, LibraryHealth } from "../types";

export function HealthBadge({ status }: { status: LibraryHealth }) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function GenerationStatusBadge({
  status,
  outcomeKnown = true,
}: {
  status: GenerationStatus;
  outcomeKnown?: boolean;
}) {
  return (
    <span className={`status-label status-label--${status}`}>
      {status}
      {!outcomeKnown && " · outcome unknown"}
    </span>
  );
}
