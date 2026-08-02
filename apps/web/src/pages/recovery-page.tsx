import { useState } from "react";
import type { ApiClient } from "../api/client";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { useApiResource } from "../hooks/use-api-resource";
import { useDialogFocus } from "../hooks/use-dialog-focus";
import type { RecoveryAction } from "../types";

export function RecoveryPage({ api }: { api: ApiClient }) {
  const resource = useApiResource("recovery", (signal) => api.recovery(signal));
  const [dryRun, setDryRun] = useState<{
    transactionId: string;
    action: RecoveryAction;
    consequence: string;
    warnings: string[];
  }>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const dryRunDialogRef = useDialogFocus<HTMLElement>(Boolean(dryRun), () => setDryRun(undefined));

  const inspect = async (transactionId: string, action: RecoveryAction) => {
    setPending(true);
    setMessage(undefined);
    try {
      const result = await api.recoveryDryRun(transactionId, action);
      setDryRun({ transactionId, action, ...result });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dry-run failed.");
    } finally {
      setPending(false);
    }
  };
  const execute = async () => {
    if (!dryRun) return;
    setPending(true);
    try {
      await api.recoveryAction(dryRun.transactionId, dryRun.action);
      setDryRun(undefined);
      setMessage("Recovery action completed.");
      resource.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recovery action failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="page recovery-page">
      <header className="page-heading">
        <span className="eyebrow">Operations / explicit intervention</span>
        <h1>Recovery</h1>
        <p>Inspect incomplete transactions. Every action starts with a read-only dry-run.</p>
      </header>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {resource.status === "loading" && !resource.data && (
        <LoadingState label="Inspecting staging transactions" />
      )}
      {resource.status === "error" && (
        <ErrorState error={resource.error} onRetry={resource.reload} />
      )}
      {resource.data && resource.data.items.length > 0 && (
        <ol className="recovery-list">
          {resource.data.items.map((item) => (
            <li key={item.transactionId} className={`recovery-card recovery-card--${item.state}`}>
              <header>
                <div>
                  <span className="state-code">{item.state.replaceAll("_", " ")}</span>
                  <code>{item.transactionId}</code>
                </div>
                <span>{formatAge(item.ageSeconds)}</span>
              </header>
              <dl>
                <div>
                  <dt>Creation</dt>
                  <dd>{item.creationId ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt>Generation</dt>
                  <dd>{item.generationId ?? "Not prepared"}</dd>
                </div>
                <div>
                  <dt>Age</dt>
                  <dd>{formatAge(item.ageSeconds)}</dd>
                </div>
              </dl>
              <div className="validation-list">
                <strong>Validation</strong>
                {item.validation.length ? (
                  <ul>
                    {item.validation.map((entry, index) => (
                      <li key={index}>{entry}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No validation errors.</p>
                )}
              </div>
              <footer>
                <span>Recommended: {item.recommendedAction.replaceAll("_", " ")}</span>
                <div>
                  {item.availableActions.map((action) => (
                    <button
                      className={
                        action === item.recommendedAction ? "button button--primary" : "button"
                      }
                      disabled={pending}
                      onClick={() => void inspect(item.transactionId, action as RecoveryAction)}
                      key={action}
                    >
                      Dry-run {action.replaceAll("_", " ")}
                    </button>
                  ))}
                </div>
              </footer>
            </li>
          ))}
        </ol>
      )}
      {resource.data?.items.length === 0 && (
        <EmptyState
          title="No interrupted transactions"
          description="Staging is clear. Committed Archive history remains immutable."
        />
      )}
      {dryRun && (
        <aside
          ref={dryRunDialogRef}
          className="dry-run-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dry-run-title"
        >
          <span className="eyebrow">Read-only preview</span>
          <h2 id="dry-run-title">{dryRun.action.replaceAll("_", " ")}</h2>
          <code>{dryRun.transactionId}</code>
          <p>{dryRun.consequence}</p>
          {dryRun.warnings.length > 0 && (
            <ul>
              {dryRun.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          <div className="button-row">
            <button className="button" onClick={() => setDryRun(undefined)}>
              Cancel
            </button>
            <button
              className="button button--primary"
              disabled={pending}
              onClick={() => void execute()}
            >
              Confirm action
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
