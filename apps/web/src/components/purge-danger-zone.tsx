import { useRef, useState } from "react";
import type { PurgePlan } from "../types";
import type { ApiClient } from "../api/client";
import { useDialogFocus } from "../hooks/use-dialog-focus";
import { navigate } from "../router";

export function PurgeDangerZone({
  api,
  kind,
  id,
  label,
}: {
  api: ApiClient;
  kind: "creation" | "image";
  id: string;
  label?: string;
}) {
  const [plan, setPlan] = useState<PurgePlan>();
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [planCurrent, setPlanCurrent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const closeConfirmation = () => {
    if (busy) return;
    setConfirming(false);
    globalThis.setTimeout(() => reviewButtonRef.current?.focus(), 0);
  };
  const dialogRef = useDialogFocus<HTMLElement>(confirming, closeConfirmation);

  const prepare = async (abandonRecoveryTransactionIds = selectedEvidence) => {
    setBusy(true);
    setMessage(undefined);
    setPlanCurrent(false);
    try {
      setPlan(await api.preparePurge(kind, id, abandonRecoveryTransactionIds));
      setPlanCurrent(true);
      setConfirming(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Purge Plan could not be prepared.");
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (
      !plan ||
      !planCurrent ||
      !plan.executable ||
      selectedEvidence.length !== plan.abandonedRecoveryTransactionIds.length ||
      !selectedEvidence.every((transactionId) =>
        plan.abandonedRecoveryTransactionIds.includes(transactionId),
      )
    )
      return;
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
    setPlanCurrent(false);
    setSelectedEvidence((current) =>
      current.includes(transactionId)
        ? current.filter((value) => value !== transactionId)
        : [...current, transactionId].sort(),
    );
  };
  const evidenceSelectionMatchesPlan =
    plan !== undefined &&
    selectedEvidence.length === plan.abandonedRecoveryTransactionIds.length &&
    selectedEvidence.every((transactionId) =>
      plan.abandonedRecoveryTransactionIds.includes(transactionId),
    );

  return (
    <section className="purge-danger-zone" aria-labelledby={`purge-${kind}-title`}>
      <span className="eyebrow">Danger Zone</span>
      <h2 id={`purge-${kind}-title`}>Purge {kind === "creation" ? "Creation" : "Image Asset"}</h2>
      <p>
        This permanently removes managed Archive data. It cannot be undone and does not delete Inbox
        or external source files.
      </p>
      <button
        ref={reviewButtonRef}
        className="button button--danger"
        disabled={busy}
        onClick={() => void prepare()}
      >
        {busy ? "Preparing…" : "Review Purge impact"}
      </button>
      {confirming && plan && (
        <div
          className="confirmation-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeConfirmation();
          }}
        >
          <aside
            ref={dialogRef}
            className="purge-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`purge-${kind}-confirmation-title`}
          >
            <span className="eyebrow">Permanent deletion</span>
            <h3 id={`purge-${kind}-confirmation-title`}>
              Permanently delete this {kind === "creation" ? "Creation" : "Image Asset"}?
            </h3>
            {label && <strong>{label}</strong>}
            <code>{id}</code>
            <p>This Purge cannot be undone. Review the prepared impact before continuing.</p>
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
                  <dt>Retained assets</dt>
                  <dd>{plan.retainedAssetSha256.length}</dd>
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
              {plan.abandonedRecoveryTransactionIds.length > 0 && (
                <p className="inline-warning">
                  This confirmation also abandons {plan.abandonedRecoveryTransactionIds.length}{" "}
                  selected recovery transaction
                  {plan.abandonedRecoveryTransactionIds.length === 1 ? "" : "s"}.
                </p>
              )}
              {plan.warnings.map((warning) => (
                <p className="inline-warning" key={warning}>
                  {warning}
                </p>
              ))}
            </div>
            {message && <p role="status">{message}</p>}
            <div className="button-row">
              <button className="button" disabled={busy} onClick={closeConfirmation}>
                Cancel
              </button>
              <button
                className="button button--danger"
                disabled={busy || !planCurrent || !plan.executable || !evidenceSelectionMatchesPlan}
                onClick={() => void execute()}
              >
                {busy ? "Deleting…" : "Permanently delete"}
              </button>
            </div>
          </aside>
        </div>
      )}
      {message && !confirming && <p role="status">{message}</p>}
    </section>
  );
}
