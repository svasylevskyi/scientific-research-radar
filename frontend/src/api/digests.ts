import type {
  AdminDigest,
  Digest,
  DigestInput,
  DigestListResponse,
  DigestRunDetail,
  DigestRunListResponse,
  DigestUpdateInput,
  DigestSchedule,
} from "../types/digest";
import { apiRequest } from "./client";

function listSearch(params: { offset: number; limit: number; ownerId?: string }) {
  const search = new URLSearchParams({
    offset: String(params.offset),
    limit: String(params.limit),
  });
  if (params.ownerId) search.set("owner_id", params.ownerId);
  return search;
}

export const digestsApi = {
  saveSchedule(digestId: string, schedule: DigestSchedule): Promise<Digest> {
    return apiRequest<Digest>(`/digests/${digestId}/schedule`, { method: "PUT", body: schedule });
  },
  create(input: DigestInput): Promise<Digest> {
    return apiRequest<Digest>("/digests", { method: "POST", body: input });
  },

  list(params: { offset: number; limit: number }): Promise<DigestListResponse> {
    return apiRequest<DigestListResponse>(`/digests?${listSearch(params)}`);
  },

  get(digestId: string): Promise<Digest> {
    return apiRequest<Digest>(`/digests/${digestId}`);
  },

  update(digestId: string, input: DigestUpdateInput): Promise<Digest> {
    return apiRequest<Digest>(`/digests/${digestId}`, { method: "PATCH", body: input });
  },

  delete(digestId: string): Promise<void> {
    return apiRequest<void>(`/digests/${digestId}`, { method: "DELETE" });
  },
};

export const digestRunsApi = {
  runNow(digestId: string): Promise<DigestRunDetail> {
    return apiRequest<DigestRunDetail>(`/digests/${digestId}/runs`, { method: "POST" });
  },

  list(
    digestId: string,
    params: { offset: number; limit: number },
  ): Promise<DigestRunListResponse> {
    const search = new URLSearchParams({
      offset: String(params.offset),
      limit: String(params.limit),
    });
    return apiRequest<DigestRunListResponse>(`/digests/${digestId}/runs?${search}`);
  },

  get(digestId: string, runId: string): Promise<DigestRunDetail> {
    return apiRequest<DigestRunDetail>(`/digests/${digestId}/runs/${runId}`);
  },

  retry(digestId: string, runId: string): Promise<DigestRunDetail> {
    return apiRequest<DigestRunDetail>(`/digests/${digestId}/runs/${runId}/retry`, {
      method: "POST",
    });
  },

  updateFeedback(
    digestId: string,
    runId: string,
    feedbackText: string,
  ): Promise<DigestRunDetail> {
    return apiRequest<DigestRunDetail>(`/digests/${digestId}/runs/${runId}/feedback`, {
      method: "PUT",
      body: { feedback_text: feedbackText },
    });
  },

  active(): Promise<DigestRunDetail | null> {
    return apiRequest<DigestRunDetail | null>("/digest-runs/active");
  },
};

export const adminDigestsApi = {
  list(params: {
    offset: number;
    limit: number;
    ownerId?: string;
  }): Promise<DigestListResponse<AdminDigest>> {
    return apiRequest<DigestListResponse<AdminDigest>>(
      `/admin/digests?${listSearch(params)}`,
    );
  },

  get(digestId: string): Promise<AdminDigest> {
    return apiRequest<AdminDigest>(`/admin/digests/${digestId}`);
  },

  listRuns(
    digestId: string,
    params: { offset: number; limit: number },
  ): Promise<DigestRunListResponse> {
    const search = new URLSearchParams({
      offset: String(params.offset),
      limit: String(params.limit),
    });
    return apiRequest<DigestRunListResponse>(`/admin/digests/${digestId}/runs?${search}`);
  },

  getRun(digestId: string, runId: string): Promise<DigestRunDetail> {
    return apiRequest<DigestRunDetail>(`/admin/digests/${digestId}/runs/${runId}`);
  },

  update(digestId: string, input: DigestUpdateInput): Promise<AdminDigest> {
    return apiRequest<AdminDigest>(`/admin/digests/${digestId}`, {
      method: "PATCH",
      body: input,
    });
  },

  delete(digestId: string): Promise<void> {
    return apiRequest<void>(`/admin/digests/${digestId}`, { method: "DELETE" });
  },
};
