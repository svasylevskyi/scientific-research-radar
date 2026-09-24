/** Preserve old shared links while keeping user-facing app URLs under /radar. */
export function radarPathname(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (["/login", "/register", "/register/plan", "/forgot-password", "/reset-password", "/profile", "/subscription"].includes(path)) {
    return `/radar${path}`;
  }
  const digest = path.match(/^\/(?:radar\/)?digests\/([^/]+)(?:\/history)?$/);
  if (digest) return `/radar/digests/${digest[1]}`;
  return path;
}
