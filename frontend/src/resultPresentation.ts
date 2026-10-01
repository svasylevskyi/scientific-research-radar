import type { DigestRunDetail, DigestRunPaper } from "./types/digest";
import { runDate } from "./runHistory";

/** Preserve dates as calendar dates; never reinterpret them in the viewer's zone. */
export function resultDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Not recorded";
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "Not recorded";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function resultTimestamp(value: string): string {
  const date = runDate(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Not recorded";
}

/** A title/DOI resemblance is not enough to identify a supporting paper. */
export function resolvePaperReference(papers: readonly DigestRunPaper[], externalId: string): DigestRunPaper | null {
  const matches = papers.filter(({ paper }) => paper.external_id === externalId);
  return matches.length === 1 ? matches[0]! : null;
}

export function safeSourceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? value : null;
  } catch { return null; }
}

export function paperElementId(runId: string, paperId: string): string {
  // Length-delimited, encoded identifiers avoid collisions and CSS selector interpolation.
  return `result-paper-${runId.length}-${encodeURIComponent(runId)}-${encodeURIComponent(paperId)}`;
}

export type PaperHref = (paperId: string) => string;

export function runOverview(run: DigestRunDetail) {
  const snapshot = run.digest_snapshot;
  const topic = typeof snapshot.topic === "string" && snapshot.topic.trim() ? snapshot.topic : "Topic not recorded";
  const status = ({ queued: "Queued", running: "Running", completed: "Completed", failed: "Failed" } as const)[run.status];
  const notice = run.quality_delivery_blocked
    ? "Delivery is held for review. Completion and AI confidence do not establish research validity."
    : run.status === "failed"
      ? "This run failed. Any saved output below is partial; review Run Steps for execution details."
      : run.status === "queued" || run.status === "running"
        ? "Research is not complete. Saved output and paper counts may change while this run progresses."
        : "Completion describes processing, not independent verification. Check important claims against the original sources.";
  return {
    topic, status, notice,
    period: `${resultDate(snapshot.reporting_from)} – ${resultDate(snapshot.reporting_to)}`,
    started: resultTimestamp(run.started_at),
    paperCount: run.paper_count,
    summaryCount: run.paper_results.filter((result) => Boolean(result.summary_data)).length,
  };
}
