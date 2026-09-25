/** Coordinate temporary cooldowns without surfacing them as application errors. */
type Cooldown = { until: number; recoverUntil: number; nextSlot: number };

export function retryDelay(value: string | null, attempt: number, now = Date.now()) {
  if (value?.trim()) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1000, seconds * 1000);
    const deadline = Date.parse(value);
    if (Number.isFinite(deadline)) return Math.max(1000, deadline - now);
  }
  return Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
}

function wait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const finish = () => { signal?.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(signal?.reason); };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export function createRateLimitRetry() {
  const cooldowns = new Map<string, Cooldown>();
  return {
    defer(requestKey: string, response: Response, attempt: number) {
      const key = response.headers.get("X-Radar-Rate-Limit-Scope") === "global" ? "*" : requestKey;
      const until = Date.now() + retryDelay(response.headers.get("Retry-After"), attempt) + Math.random() * 250;
      const previous = cooldowns.get(key);
      cooldowns.set(key, { until: Math.max(until, previous?.until ?? 0),
        recoverUntil: Math.max(until + 5000, previous?.recoverUntil ?? 0), nextSlot: previous?.nextSlot ?? 0 });
    },
    async ready(requestKey: string, signal?: AbortSignal) {
      for (;;) {
        signal?.throwIfAborted();
        const now = Date.now();
        for (const [key, value] of cooldowns) if (value.recoverUntil <= now) cooldowns.delete(key);
        const gates = [cooldowns.get("*"), cooldowns.get(requestKey)].filter((value): value is Cooldown => !!value);
        const deadline = Math.max(now, ...gates.map(value => Math.max(value.until, value.nextSlot)));
        if (deadline > now) { await wait(Math.min(deadline - now, 60000), signal); continue; }
        // Spread waiting requests across the recovery window instead of releasing a burst.
        for (const gate of gates) gate.nextSlot = now + 150;
        return;
      }
    },
  };
}
