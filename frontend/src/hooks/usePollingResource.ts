import { useCallback, useEffect, useRef, useState } from "react";
import { startPagePolling } from "../pagePolling";
import { createResourceLoader, type ResourceState } from "../resourceLoading";

/** Stable loaders receive a cancellation signal. Last complete data survives errors.
 * Use interval 0 for one-off loads with bounded cooldown recovery.
 * keepPreviousData is for pagination of the same entity only.
 */
export function usePollingResource<T>(load: (signal: AbortSignal) => Promise<T>, delay = 10000, keepPreviousData = false) {
  const empty: ResourceState<T> = { data: null, error: "", loading: true, retryAt: 0, retrying: false };
  const [stored, setStored] = useState({ load, state: empty });
  const state = stored.load === load ? stored.state : { ...empty, data: keepPreviousData ? stored.state.data : null };
  const previous = useRef<T | null>(null);
  const current = useRef<{ refresh: () => Promise<void> } | null>(null);
  useEffect(() => {
    const data = keepPreviousData ? previous.current : null;
    setStored({ load, state: { data, error: "", loading: true, retryAt: 0, retrying: false } });
    const resource = createResourceLoader(load, next => { previous.current = next.data; setStored({ load, state: next }); }, data);
    const stop = startPagePolling(() => resource.refresh(), delay, undefined, resource.nextAllowedAt);
    const handle = { refresh: async () => { await resource.refresh(true); stop.schedule(); } };
    current.current = handle;
    return () => {
      stop(); resource.stop();
      if (current.current === handle) current.current = null;
    };
  }, [load, delay, keepPreviousData]);
  const refresh = useCallback(() => current.current?.refresh() ?? Promise.resolve(), []);
  return { ...state, refresh };
}
