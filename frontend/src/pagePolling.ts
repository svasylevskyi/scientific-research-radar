/** Poll visible pages, honor resource cooldowns, and never overlap requests.
 * A zero interval loads once, with automatic recovery only when deferred.
 */
export function startPagePolling(refresh: () => Promise<void>, delay: number,
  environment = { window, document }, nextAllowedAt = () => 0) {
  const { window: browser, document: page } = environment;
  const visible = () => page.visibilityState !== "hidden";
  let stopped = false;
  let busy = false;
  let started = false;
  let timer: number | undefined;
  function schedule() {
    browser.clearTimeout(timer);
    const deadline = nextAllowedAt();
    if (stopped || !visible() || !Number.isFinite(deadline) || (delay <= 0 && !deadline)) return;
    timer = browser.setTimeout(() => void poll(), Math.min(60000, Math.max(delay, deadline - Date.now(), 1)));
  }
  async function poll() {
    if (stopped || busy || !visible()) return;
    if (nextAllowedAt() > Date.now()) { schedule(); return; }
    browser.clearTimeout(timer);
    busy = true;
    started = true;
    try { await refresh(); }
    catch { /* Keep the last known state; a later poll can recover. */ }
    finally { busy = false; schedule(); }
  }
  const resume = () => {
    if (!visible()) browser.clearTimeout(timer);
    else if (!started || delay > 0 || nextAllowedAt()) void poll();
  };
  browser.addEventListener("focus", resume);
  page.addEventListener("visibilitychange", resume);
  void poll();
  return Object.assign(() => {
    stopped = true;
    browser.clearTimeout(timer);
    browser.removeEventListener("focus", resume);
    page.removeEventListener("visibilitychange", resume);
  }, { schedule });
}
