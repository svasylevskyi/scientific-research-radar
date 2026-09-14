import { useCallback, useEffect, useRef, useState } from "react";
import { startPagePolling } from "../pagePolling";
import { createRefreshQueue } from "../refreshQueue";

/** Pass a stable loader. Retain the last complete result on transient errors. */
export function usePollingResource<T>(load: () => Promise<T>, delay = 10000) {
  const [state, setState] = useState<{
    data: T | null;
    error: string;
    loading: boolean;
  }>({ data: null, error: "", loading: true });
  const queue = useRef<ReturnType<typeof createRefreshQueue> | null>(null);
  useEffect(() => {
    let active = true;
    setState({ data: null, error: "", loading: true });
    const current = createRefreshQueue(async () => {
      try {
        const data = await load();
        if (active) setState({ data, error: "", loading: false });
      } catch (error) {
        if (active)
          setState((old) => ({
            ...old,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not refresh. Please retry.",
          }));
      }
    });
    queue.current = current;
    const stop = startPagePolling(current.refresh, delay);
    return () => {
      active = false;
      stop();
      current.stop();
      if (queue.current === current) queue.current = null;
    };
  }, [load, delay]);
  const refresh = useCallback(
    () => queue.current?.refresh() ?? Promise.resolve(),
    [],
  );
  return { ...state, refresh };
}
