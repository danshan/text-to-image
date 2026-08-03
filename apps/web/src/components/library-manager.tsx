import { useEffect, useRef, useState } from "react";
import type { ApiClient } from "../api/client";
import type { LibraryTransition, LibraryTransitionAction, WebBootstrap } from "../types";

export function LibraryManager({ api, bootstrap }: { api: ApiClient; bootstrap: WebBootstrap }) {
  const [libraryPath, setLibraryPath] = useState(bootstrap.library.libraryRoot);
  const [transition, setTransition] = useState<LibraryTransition>();
  const [transitionError, setTransitionError] = useState<string>();
  const committing = useRef<string | undefined>(undefined);

  useEffect(() => {
    void api.libraryTransition().then((value) => {
      if (value) setTransition(value);
    });
  }, [api]);

  useEffect(() => {
    if (!transition || transition.stage !== "preparing") return undefined;
    const timer = window.setInterval(() => {
      void api.libraryTransition().then((value) => {
        if (value) setTransition(value);
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [api, transition]);

  useEffect(() => {
    if (!transition || transition.stage !== "ready" || committing.current === transition.id) return;
    committing.current = transition.id;
    void api.commitLibraryTransition(transition.id).then(
      () => window.location.assign("/gallery"),
      (error: unknown) => {
        committing.current = undefined;
        setTransitionError(error instanceof Error ? error.message : "Library switch failed.");
        void api.libraryTransition().then((value) => {
          if (value) setTransition(value);
        });
      },
    );
  }, [api, transition]);

  const start = async (action: LibraryTransitionAction) => {
    setTransitionError(undefined);
    try {
      setTransition(
        await api.startLibraryTransition(action, action === "retry" ? undefined : libraryPath),
      );
    } catch (error) {
      setTransitionError(error instanceof Error ? error.message : "Library transition failed.");
    }
  };

  const busy = transition?.stage === "preparing" || transition?.stage === "switching";

  return (
    <section className="library-manager" aria-labelledby="library-manager-title">
      <span className="eyebrow">Library management</span>
      <h2 id="library-manager-title">Initialize or switch Library</h2>
      <p>
        Enter an absolute directory path visible to the local service. Selecting an existing Library
        or initializing a new one makes it the active Library.
      </p>

      <label htmlFor="library-path">Library path</label>
      <input
        id="library-path"
        value={libraryPath}
        onChange={(event) => setLibraryPath(event.target.value)}
        spellCheck={false}
      />
      <div className="button-row">
        <button
          className="button button--primary"
          disabled={busy}
          onClick={() => void start("select")}
        >
          Select existing
        </button>
        <button className="button" disabled={busy} onClick={() => void start("initialize")}>
          Initialize Library
        </button>
        {bootstrap.library.status === "unavailable" && (
          <button className="button" disabled={busy} onClick={() => void start("retry")}>
            Retry current path
          </button>
        )}
      </div>

      {transition && (
        <div className="transition-progress" role="status" aria-live="polite">
          <strong>{transition.stage.replaceAll("_", " ")}</strong>
          <code>{transition.libraryRoot}</code>
          <progress
            value={transition.processed}
            {...(transition.total === null ? {} : { max: Math.max(transition.total, 1) })}
          />
          {transition.error && <p>{transition.error}</p>}
        </div>
      )}
      {transitionError && (
        <p className="form-message form-message--error" role="alert">
          {transitionError}
        </p>
      )}
    </section>
  );
}
