import { apiRequest } from "./client";
import type { components } from "../types/api.generated";

export type ClaimReview = components["schemas"]["ClaimReviewRead"];
export type ClaimReviewConfig = components["schemas"]["ClaimReviewConfig-Output"];
export type ClaimReviewStart = components["schemas"]["ClaimReviewStart"];
export type ClaimReviewTarget = { digest_id: string; run_id: string } | { benchmark_id: string };

export const claimReviewsApi = {
  history: (target: ClaimReviewTarget, page: number) => apiRequest<components["schemas"]["ClaimReviewHistory"]>(
    `/admin/research-quality/claim-reviews?${new URLSearchParams({ ...target, offset: String((page - 1) * 5), limit: "5" })}`),
  start: (payload: ClaimReviewStart) => apiRequest<ClaimReview>("/admin/research-quality/claim-reviews", { method: "POST", body: payload }),
  detail: (id: string, signal?: AbortSignal) => apiRequest<ClaimReview>(`/admin/research-quality/claim-reviews/${id}`, { signal }),
  export: (id: string) => apiRequest<components["schemas"]["ClaimReviewExport"]>(`/admin/research-quality/claim-reviews/${id}/export`),
};
