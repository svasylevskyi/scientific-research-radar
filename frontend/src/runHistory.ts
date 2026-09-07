import type { DigestRunListResponse, DigestRunSummary } from "./types/digest";

export async function loadRunHistory(fetchPage: (offset: number) => Promise<DigestRunListResponse>) {
  const runs: DigestRunSummary[] = [];
  let total = 1;
  while (runs.length < total) {
    const page = await fetchPage(runs.length);
    total = page.total;
    if (!page.items.length) break;
    runs.push(...page.items);
  }
  return [...new Map(runs.map((run) => [run.id, run])).values()];
}

export function defaultRunId(runs: DigestRunSummary[]) {
  return runs.find((run) => run.status === "completed")?.id || "";
}

export function runDate(value: string) {
  return new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
}

export function filterRuns(runs: DigestRunSummary[], from: string, to: string) {
  if (from && to && from > to) return [];
  return runs.filter((item) => {
    const date = runDate(item.started_at);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return (!from || day >= from) && (!to || day <= to);
  });
}
