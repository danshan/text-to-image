import { useEffect, useRef, useState } from "react";

export type ResourceState<T> =
  | { status: "loading"; data?: T; error?: undefined }
  | { status: "success"; data: T; error?: undefined }
  | { status: "error"; data?: T; error: unknown };

export interface ResourceResult<T> extends ResourceStateShape<T> {
  reload: () => void;
}

interface ResourceStateShape<T> {
  status: "loading" | "success" | "error";
  data?: T;
  error?: unknown;
}

export function useApiResource<T>(
  key: string,
  request: (signal: AbortSignal) => Promise<T>,
): ResourceResult<T> {
  const requestRef = useRef(request);
  requestRef.current = request;
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    void requestRef.current(controller.signal).then(
      (data) => setState({ status: "success", data }),
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", error });
        }
      },
    );

    return () => controller.abort();
  }, [key, reloadKey]);

  return {
    ...state,
    reload: () => setReloadKey((value) => value + 1),
  };
}
