/** URL state shared by lists, detail links, and run tabs. */
export function updateQuery(search: URLSearchParams, values: Record<string, string | number | null>) {
  const next = new URLSearchParams(search);
  for (const [key, value] of Object.entries(values)) {
    if (value === null) next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}

export function queryPath(path: string, search: URLSearchParams) {
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function pageNumber(search: URLSearchParams) {
  const value = search.get("page") ?? "1";
  const page = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(page * 100) ? page : 1;
}

export function withReturnTo(path: string, returnTo: string) {
  const [pathname = "", query] = path.split("?");
  return queryPath(pathname, updateQuery(new URLSearchParams(query), { return_to: returnTo }));
}

/** Return links can only point to the expected internal list, never arbitrary URLs. */
export function listReturnTo(search: URLSearchParams, list: "/admin/digests" | "/admin/users" | "/radar") {
  const value = search.get("return_to");
  return value && (value === list || value.startsWith(`${list}?`)) ? value : list;
}

export function sourceRunReturnTo(search: URLSearchParams) {
  const value = search.get("return_to");
  return value && /^\/admin\/digests\/[\w-]+\/runs(?:\?|$)/.test(value) ? value : null;
}

export type DiagnosticTab = "quality" | "costs" | "steps";
export function diagnosticTab(search: URLSearchParams): DiagnosticTab {
  const value = search.get("diagnostic_tab");
  return value === "costs" || value === "steps" ? value : "quality";
}

export function qualitySection(hash: string) {
  // Preserve links published before the workspace gained its own tab.
  return hash === "#benchmarks" || hash === "#benchmark-review" ? "benchmarks" : "settings";
}
