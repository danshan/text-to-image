import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import type { CreationStatus, CurationPatchRequest } from "../types";

export interface CurationValues {
  title?: string;
  tags: string[];
  favorite: boolean;
  rating?: number | null;
  note: string;
  hidden?: boolean;
  status?: CreationStatus;
  entityRevision: number;
}

export function CurationEditor({
  value,
  kind,
  onSave,
}: {
  value: CurationValues;
  kind: "image" | "creation";
  onSave: (request: CurationPatchRequest) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [serverCurrent, setServerCurrent] = useState<unknown>();

  useEffect(() => {
    if (!conflict) setDraft(value);
  }, [conflict, value]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(undefined);
    try {
      await onSave({
        expectedRevision: value.entityRevision,
        patch: {
          ...(kind === "creation"
            ? { title: draft.title, status: draft.status }
            : { rating: draft.rating, hidden: draft.hidden }),
          tags: draft.tags,
          favorite: draft.favorite,
          note: draft.note,
        },
      });
      setConflict(false);
      setServerCurrent(undefined);
      setMessage("Curation saved.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setConflict(true);
        const conflictBody = error.body as typeof error.body & { current?: unknown };
        setServerCurrent(conflictBody.current ?? error.body.details?.current ?? error.body.details);
        setMessage(
          "The Library changed after this form opened. Your edits are preserved; review the current record and retry.",
        );
      } else {
        setMessage(error instanceof Error ? error.message : "Curation could not be saved.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="curation-form" onSubmit={(event) => void submit(event)}>
      <div className="inspector-section-heading">
        <span className="eyebrow">Mutable layer</span>
        <h2>Curation</h2>
        <span className="revision-chip">r{value.entityRevision}</span>
      </div>
      {kind === "creation" && (
        <>
          <label>
            Title
            <input
              value={draft.title ?? ""}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>
          <label>
            Status
            <select
              value={draft.status ?? "active"}
              onChange={(event) =>
                setDraft({ ...draft, status: event.target.value as CreationStatus })
              }
            >
              <option value="active">Active</option>
              <option value="shelved">Shelved</option>
            </select>
          </label>
        </>
      )}
      <label>
        Tags
        <input
          value={draft.tags.join(", ")}
          onChange={(event) =>
            setDraft({
              ...draft,
              tags: event.target.value
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            })
          }
          placeholder="portrait, editorial"
        />
      </label>
      <label>
        Note
        <textarea
          value={draft.note}
          rows={4}
          onChange={(event) => setDraft({ ...draft, note: event.target.value })}
        />
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={draft.favorite}
          onChange={(event) => setDraft({ ...draft, favorite: event.target.checked })}
        />{" "}
        Favorite
      </label>
      {kind === "image" && (
        <>
          <fieldset className="rating-field">
            <legend>Rating</legend>
            <div>
              {[1, 2, 3, 4, 5].map((rating) => (
                <label key={rating}>
                  <input
                    type="radio"
                    name="rating"
                    value={rating}
                    checked={draft.rating === rating}
                    onChange={() => setDraft({ ...draft, rating })}
                  />
                  <span>{rating}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="check-field">
            <input
              type="checkbox"
              checked={draft.hidden ?? false}
              onChange={(event) => setDraft({ ...draft, hidden: event.target.checked })}
            />{" "}
            Hide from main Gallery
          </label>
        </>
      )}
      {message && (
        <p
          className={conflict ? "form-message form-message--warning" : "form-message"}
          role="status"
        >
          {message}
        </p>
      )}
      {conflict && serverCurrent !== undefined && (
        <details className="conflict-current">
          <summary>Review current Library record</summary>
          <pre>{JSON.stringify(serverCurrent, null, 2)}</pre>
        </details>
      )}
      <button className="button button--primary" disabled={saving}>
        {saving ? "Saving…" : conflict ? "Review and retry" : "Save curation"}
      </button>
    </form>
  );
}
