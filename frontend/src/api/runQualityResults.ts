import { adminDigestsApi } from "./digests";
import { claimReviewsApi } from "./claimReviews";
import { researchQualityApi } from "./researchQuality";

export type QualityPages = { evaluations: number; sources: number; reviews: number };

/** Saved results only. Provider lookups and paid review creation are separate commands. */
export async function loadRunQualityResults(digestId: string, runId: string, pages: QualityPages) {
  const target = { digest_id: digestId, run_id: runId };
  const [run, settings, evaluations, sources, content, reviews, firstEvaluation, firstSource, firstReview] = await Promise.all([
    adminDigestsApi.getRun(digestId, runId),
    researchQualityApi.get(),
    researchQualityApi.evaluations(digestId, runId, pages.evaluations),
    researchQualityApi.sources(digestId, runId, pages.sources),
    researchQualityApi.content(digestId, runId),
    claimReviewsApi.history(target, pages.reviews),
    pages.evaluations === 1 ? null : researchQualityApi.evaluations(digestId, runId, 1, 1),
    pages.sources === 1 ? null : researchQualityApi.sources(digestId, runId),
    pages.reviews === 1 ? null : claimReviewsApi.history(target, 1),
  ]);
  return {
    run, settings, evaluations, sources, content, reviews,
    latestEvaluation: (firstEvaluation ?? evaluations).items[0] ?? null,
    latestSource: (firstSource ?? sources).items[0] ?? null,
    latestReview: (firstReview ?? reviews).items[0] ?? null,
  };
}
export type RunQualityResults = Awaited<ReturnType<typeof loadRunQualityResults>>;
