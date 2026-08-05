import { useState } from "react";
import type { PurgePlan } from "../types";
import type { ApiClient } from "../api/client";
import { navigate } from "../router";

export function PurgeDangerZone({
  api,
  kind,
  id,
}: {
  api: ApiClient;
  kind: "creation" | "image";
  id: string;
}) {
  const [plan, setPlan] = useState<PurgePlan>();
  const [confirmation, setConfirmation] = useState("");
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const prepare = async (abandonRecoveryTransactionIds = selectedEvidence) => {
    setBusy(true);
    setMessage(undefined);
    try {
      setPlan(await api.preparePurge(kind, id, abandonRecoveryTransactionIds));
      setConfirmation("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Purge Plan could not be prepared.");
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (!plan || confirmation !== plan.confirmationPhrase || !plan.executable) return;
    setBusy(true);
    setMessage("Library maintenance is running. Keep this window open.");
    try {
      await api.executePurge(kind, id, plan);
      navigate(kind === "creation" ? "/creations" : "/gallery", { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Purge could not be completed.");
      setBusy(false);
    }
  };

  const toggleEvidence = (transactionId: string) => {
    setSelectedEvidence((current) =>
      current.includes(transactionId)
        ? current.filter((value) => value !== transactionId)
        : [...current, transactionId].sort(),
    );
  };

  return (
    <section className="purge-danger-zone" aria-labelledby={`purge-${kind}-title`}>
      <span className="eyebrow">Danger Zone</span>
      <h2 id={`purge-${kind}-title`}>Purge {kind === "creation" ? "Creation" : "Image Asset"}</h2>
      <p>
        This permanently removes managed Archive data. It cannot be undone and does not delete Inbox
        or external source files.
      </p>
      {!plan ? (
        <button className="button button--danger" disabled={busy} onClick={() => void prepare()}>
          {busy ? "Preparing…" : "Review Purge impact"}
        </button>
      ) : (
        <div className="purge-plan">
          <dl>
            <div>
              <dt>Managed paths</dt>
              <dd>{plan.deletePaths.length}</dd>
            </div>
            <div>
              <dt>Bytes</dt>
              <dd>{plan.deleteByteCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Blocking relations</dt>
              <dd>{plan.blockingRelations.length}</dd>
            </div>
          </dl>
          {plan.blockingRelations.length > 0 && (
            <ul className="danger-list">
              {plan.blockingRelations.map((relation) => (
                <li key={`${relation.generationId}:${relation.relationType}`}>
                  {relation.relationType} by Generation {relation.generationId}
                </li>
              ))}
            </ul>
          )}
          {plan.recoveryEvidence.length > 0 && (
            <fieldset>
              <legend>Recovery evidence abandonment</legend>
              {plan.recoveryEvidence.map((evidence) => (
                <label key={`${evidence.location}:${evidence.transactionId}`}>
                  <input
                    type="checkbox"
                    checked={selectedEvidence.includes(evidence.transactionId)}
                    onChange={() => toggleEvidence(evidence.transactionId)}
                  />
                  {evidence.transactionId} ({evidence.location}, {evidence.state})
                </label>
              ))}
              <button className="button" disabled={busy} onClick={() => void prepare()}>
                Rebuild Plan with selected abandonment
              </button>
            </fieldset>
          )}
          {plan.warnings.map((warning) => (
            <p className="inline-warning" key={warning}>
              {warning}
            </p>
          ))}
          <label>
            Type <code>{plan.confirmationPhrase}</code> to confirm
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
          </label>
          <button
            className="button button--danger"
            disabled={busy || !plan.executable || confirmation !== plan.confirmationPhrase}
            onClick={() => void execute()}
          >
            {busy ? "Purging…" : "Purge permanently"}
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
