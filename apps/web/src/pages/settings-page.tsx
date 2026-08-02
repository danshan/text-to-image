import { useState } from "react";
import type { ApiClient } from "../api/client";
import { RecordError, RecordLoading } from "../components/states";
import { HealthBadge } from "../components/status";
import { useApiResource } from "../hooks/use-api-resource";
import type { WebBootstrap } from "../types";

export function SettingsPage({ api, bootstrap }: { api: ApiClient; bootstrap: WebBootstrap }) {
  const health = useApiResource("settings-health", (signal) => api.health(signal));
  const [message, setMessage] = useState<string>();
  if (health.status === "loading" && !health.data)
    return <RecordLoading title="Settings" label="Loading Library diagnostics" />;
  if (health.status === "error")
    return <RecordError title="Settings" error={health.error} onRetry={health.reload} />;
  if (!health.data) return null;

  const rebuild = async () => {
    try {
      await api.rebuildIndex();
      setMessage("Index rebuild started. Archive records are unchanged.");
      health.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Index rebuild could not start.");
    }
  };

  return (
    <div className="page settings-page">
      <header className="page-heading">
        <span className="eyebrow">Local service / diagnostics</span>
        <h1>Settings</h1>
        <p>Runtime capabilities and rebuildable state for the currently opened Library.</p>
      </header>
      <div className="settings-grid">
        <section>
          <span className="eyebrow">Library</span>
          <h2>{bootstrap.libraryName ?? "Image Workspace"}</h2>
          <HealthBadge status={health.data.status} />
          <dl className="stacked-facts">
            <div>
              <dt>API version</dt>
              <dd>{health.data.apiVersion}</dd>
            </div>
            <div>
              <dt>Library format</dt>
              <dd>{health.data.libraryFormatVersion ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Recovery items</dt>
              <dd>{health.data.recoveryCount}</dd>
            </div>
          </dl>
        </section>
        <section>
          <span className="eyebrow">Derived cache</span>
          <h2>SQLite read model</h2>
          <dl className="stacked-facts">
            <div>
              <dt>Available</dt>
              <dd>{health.data.index.available ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt>Archive marker</dt>
              <dd>
                <code>{health.data.index.latestArchiveMarker ?? "None"}</code>
              </dd>
            </div>
            <div>
              <dt>Indexed marker</dt>
              <dd>
                <code>{health.data.index.lastIndexedMarker ?? "None"}</code>
              </dd>
            </div>
            <div>
              <dt>Lag</dt>
              <dd>{health.data.index.lagCount}</dd>
            </div>
          </dl>
          <p>Rebuilding deletes no Archive or Curation data.</p>
          <button className="button button--primary" onClick={() => void rebuild()}>
            Rebuild index
          </button>
          {message && (
            <p className="form-message" role="status">
              {message}
            </p>
          )}
        </section>
        <section>
          <span className="eyebrow">Capabilities</span>
          <h2>Runtime surface</h2>
          <ul className="capability-list">
            <li>
              <span>Curation</span>
              <strong>{bootstrap.capabilities.curation ? "Available" : "Unavailable"}</strong>
            </li>
            <li>
              <span>Recovery</span>
              <strong>{bootstrap.capabilities.recovery ? "Available" : "Unavailable"}</strong>
            </li>
            <li>
              <span>Generation from Web</span>
              <strong>Never</strong>
            </li>
          </ul>
        </section>
        <section>
          <span className="eyebrow">Diagnostics</span>
          <h2>Validator report</h2>
          {health.data.diagnostics.length > 0 ? (
            <ul className="diagnostic-list">
              {health.data.diagnostics.map((diagnostic) => (
                <li key={diagnostic}>{diagnostic}</li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">No diagnostics reported.</p>
          )}
        </section>
      </div>
    </div>
  );
}
