import { useState, type FormEvent } from "react";
import { useDialogFocus } from "../hooks/use-dialog-focus";
import { activeFilterCount, defaultGalleryQuery, type GalleryQuery } from "../state/gallery-query";
import { CloseIcon, FilterIcon } from "./icons";

export function GalleryFilters({
  query,
  onChange,
}: {
  query: GalleryQuery;
  onChange: (query: GalleryQuery) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(query);
  const count = activeFilterCount(query);
  const dialogRef = useDialogFocus<HTMLElement>(open, () => setOpen(false));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onChange({ ...draft, cursor: "" });
    setOpen(false);
  };

  return (
    <>
      <button
        className="button filter-button"
        aria-expanded={open}
        aria-controls="gallery-filters"
        onClick={() => {
          setDraft(query);
          setOpen(true);
        }}
      >
        <FilterIcon /> Filters {count > 0 && <span className="filter-count">{count}</span>}
      </button>
      {open && (
        <div
          className="drawer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            ref={dialogRef}
            className="filter-drawer"
            id="gallery-filters"
            role="dialog"
            aria-modal="true"
            aria-labelledby="filter-title"
          >
            <header>
              <div>
                <span className="eyebrow">Contact sheet</span>
                <h2 id="filter-title">Refine exposure</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close filters"
                onClick={() => setOpen(false)}
              >
                <CloseIcon />
              </button>
            </header>
            <form onSubmit={submit}>
              <label>
                Creation ID
                <input
                  value={draft.creation}
                  onChange={(event) => setDraft({ ...draft, creation: event.target.value })}
                />
              </label>
              <label>
                Creation status
                <select
                  value={draft.creationStatus}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      creationStatus: event.target.value as GalleryQuery["creationStatus"],
                    })
                  }
                >
                  <option value="">Any status</option>
                  <option value="active">Active</option>
                  <option value="shelved">Shelved</option>
                </select>
              </label>
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
                  placeholder="portrait, warm-light"
                />
              </label>
              <label>
                Minimum rating
                <select
                  value={draft.rating ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      rating: event.target.value ? Number(event.target.value) : null,
                    })
                  }
                >
                  <option value="">Any rating</option>
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option value={value} key={value}>
                      {value} and up
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Source
                <select
                  value={draft.source}
                  onChange={(event) =>
                    setDraft({ ...draft, source: event.target.value as GalleryQuery["source"] })
                  }
                >
                  <option value="output">Generated output</option>
                  <option value="imported">Imported reference</option>
                  <option value="all">All images</option>
                </select>
              </label>
              <label>
                Reference role
                <select
                  value={draft.role}
                  onChange={(event) => setDraft({ ...draft, role: event.target.value })}
                >
                  <option value="">Any role</option>
                  {["subject", "style", "composition", "palette", "other"].map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </label>
              <label>
                Generation status
                <select
                  value={draft.generationStatus}
                  onChange={(event) => setDraft({ ...draft, generationStatus: event.target.value })}
                >
                  <option value="">Any status</option>
                  {["succeeded", "failed", "interrupted"].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                Tool
                <input
                  value={draft.tool}
                  onChange={(event) => setDraft({ ...draft, tool: event.target.value })}
                />
              </label>
              <label>
                Model
                <input
                  value={draft.model}
                  onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                />
              </label>
              <div className="field-pair">
                <label>
                  From
                  <input
                    type="date"
                    value={datePart(draft.from)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        from: event.target.value ? `${event.target.value}T00:00:00.000Z` : "",
                      })
                    }
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    value={datePart(draft.to)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        to: event.target.value ? `${event.target.value}T23:59:59.999Z` : "",
                      })
                    }
                  />
                </label>
              </div>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={draft.favorite}
                  onChange={(event) => setDraft({ ...draft, favorite: event.target.checked })}
                />{" "}
                Favorites only
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={draft.showHidden}
                  onChange={(event) => setDraft({ ...draft, showHidden: event.target.checked })}
                />{" "}
                Include hidden images
              </label>
              <footer>
                <button
                  type="button"
                  className="button"
                  onClick={() => setDraft({ ...defaultGalleryQuery, q: draft.q })}
                >
                  Reset
                </button>
                <button className="button button--primary" type="submit">
                  Apply filters
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function datePart(value: string): string {
  return /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0] ?? "";
}
