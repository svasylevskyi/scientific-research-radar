/** Poll visible pages, refresh on return, and never overlap requests. */
export function startPagePolling(refresh: () => Promise<void>, delay: number,
  environment = { window, document }) {
  const { window: browser, document: page } = environment;
  const visible = () => page.visibilityState !== "hidden";
  let stopped = false;
  let busy = false;
  let timer: number | undefined;
  async function poll() {
    if (stopped || busy || !visible()) return;
    browser.clearTimeout(timer);
    busy = true;
    try { await refresh(); }
    catch { /* Keep the last known state; a later poll can recover. */ }
    finally {
      busy = false;
      if (!stopped && visible()) timer = browser.setTimeout(() => void poll(), delay);
    }
  }
  const resume = () => { void poll(); };
  browser.addEventListener("focus", resume);
  page.addEventListener("visibilitychange", resume);
  void poll();
  return () => {
    stopped = true;
    browser.clearTimeout(timer);
    browser.removeEventListener("focus", resume);
    page.removeEventListener("visibilitychange", resume);
  };
}
