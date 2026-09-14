/** Serialize refreshes; a request during a load always gets a subsequent read. */
export function createRefreshQueue(load: () => Promise<void>) {
  let pending: Promise<void> | null = null;
  let requested = false;
  let stopped = false;
  return {
    refresh(): Promise<void> {
      if (stopped) return Promise.resolve();
      requested = true;
      if (!pending) {
        pending = (async () => {
          // Yield so pending is assigned even when load throws synchronously.
          await Promise.resolve();
          try {
            while (requested && !stopped) {
              requested = false;
              await load();
            }
          } finally {
            pending = null;
          }
        })();
      }
      return pending;
    },
    stop() {
      stopped = true;
      requested = false;
    },
  };
}
