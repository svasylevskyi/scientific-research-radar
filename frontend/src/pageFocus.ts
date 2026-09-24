/** Focus only after page navigation, never after filtering or background updates. */
export function focusMainContent(): boolean {
  const main = document.getElementById("main-content");
  if (!main) return false;
  main.focus({ preventScroll: true });
  main.scrollIntoView({ block: "start", behavior: "instant" });
  return true;
}

export function schedulePageFocus(): () => void {
  let frame = 0;
  let stopped = false;
  const observer = new MutationObserver(schedule);

  function stop() {
    stopped = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    document.removeEventListener("pointerdown", stop, true);
    document.removeEventListener("keydown", stop, true);
  }
  function focus() {
    if (stopped) return;
    const main = document.getElementById("main-content");
    // Session restoration can temporarily replace the page. Wait for its result.
    if (!main || main.hasAttribute("data-navigation-pending")) return;
    const target = main.querySelector<HTMLElement>("h1") ?? main;
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start", behavior: "instant" });
    stop();
  }
  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(focus);
  }
  const root = document.getElementById("page-content");
  if (root) observer.observe(root, { childList: true, subtree: true });
  // Never take focus away if the visitor starts interacting while content loads.
  document.addEventListener("pointerdown", stop, true);
  document.addEventListener("keydown", stop, true);
  schedule();
  return stop;
}
