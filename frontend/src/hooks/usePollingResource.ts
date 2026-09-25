import { useCallback, useEffect, useRef, useState } from "react";
import { startPagePolling } from "../pagePolling";
import { createRefreshQueue } from "../refreshQueue";

/**
 * Pass a stable loader. Retain the last complete result on transient errors.
 * keepPreviousData preserves mounted panels during pagination; callers must key
 * the owning component by resource ID so another entity never inherits its data.
 */
export function usePollingResource<T>(load: () => Promise<T>, delay = 10000, keepPreviousData = false) {
  const [state, setState] = useState<{
    data: T | null;
    error: string;
    loading: boolean;
  }>({ data: null, error: "", loading: true });
  const queue = useRef<ReturnType<typeof createRefreshQueue> | null>(null);
  useEffect(() => {
    let active = true;
    setState(old => ({ data: keepPreviousData ? old.data : null, error: "", loading: true }));
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
  }, [load, delay, keepPreviousData]);
  const refresh = useCallback(
    () => queue.current?.refresh() ?? Promise.resolve(),
    [],
  );
  return { ...state, refresh };
}
