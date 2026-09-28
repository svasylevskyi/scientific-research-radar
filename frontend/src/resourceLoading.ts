import { RateLimitError } from "./api/client";
import { createRefreshQueue } from "./refreshQueue";

export type ResourceState<T> = {
  data: T | null;
  error: string;
  loading: boolean;
  retryAt: number;
  retrying: boolean;
};

/** One resource owns its requests, cooldown, and bounded automatic recovery. */
export function createResourceLoader<T>(load: (signal: AbortSignal) => Promise<T>,
  publish: (state: ResourceState<T>) => void, previous: T | null = null) {
  const controller = new AbortController();
  let state: ResourceState<T> = { data: previous, error: "", loading: true, retryAt: 0, retrying: false };
  let deferrals = 0;
  const queue = createRefreshQueue(async () => {
    if (state.retryAt > Date.now()) return;
    const attempt = new AbortController();
    try {
      const data = await load(AbortSignal.any([controller.signal, attempt.signal]));
      if (controller.signal.aborted) return;
      deferrals = 0;
      state = { data, error: "", loading: false, retryAt: 0, retrying: false };
    } catch (error) {
      if (controller.signal.aborted) return;
      const deferred = error instanceof RateLimitError;
      if (deferred) deferrals++;
      state = { ...state, loading: false,
        error: error instanceof Error ? error.message : "Could not refresh. Please retry.",
        retryAt: deferred ? error.retryAt : 0,
        retrying: deferred && deferrals < 3 };
    } finally { attempt.abort(); }
    publish(state);
  });
  return {
    refresh(manual = false) {
      if (manual) deferrals = 0;
      else if (state.retryAt && !state.retrying) return Promise.resolve();
      return queue.refresh();
    },
    nextAllowedAt: () => state.retryAt && !state.retrying ? Infinity : state.retryAt,
    stop() { controller.abort(); queue.stop(); },
  };
}
