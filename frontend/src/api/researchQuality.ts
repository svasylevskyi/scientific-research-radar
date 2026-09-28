import { apiRequest } from "./client";
import type { components } from "../types/api.generated";

export type QualityConfig = components["schemas"]["QualityConfig-Output"];
export type QualitySettings = components["schemas"]["QualitySettingsRead"];
export type QualityHistory = components["schemas"]["QualitySettingsHistory"];
export type QualitySettingsUpdate = components["schemas"]["QualitySettingsUpdate"];
export type QualityEvaluation = components["schemas"]["QualityEvaluationRead"];
export type QualityEvaluationHistory = components["schemas"]["QualityEvaluationHistory"];
export type QualitySnapshot = components["schemas"]["QualitySnapshot"];
export type QualityFinding = components["schemas"]["QualityFinding"];
export type SourceVerification = components["schemas"]["SourceVerificationRead"];
export type SourceHistory = components["schemas"]["SourceVerificationHistory"];
export type PaperVerification = components["schemas"]["PaperVerification"];
export type PaperContent = components["schemas"]["PaperContentRead"];
export type RunContent = components["schemas"]["RunContentRead"];

export const researchQualityApi = {
  content: (digestId: string, runId: string, signal?: AbortSignal) =>
    apiRequest<RunContent>(`/admin/digests/${digestId}/runs/${runId}/source-content`, { signal }),
  sources: (digestId: string, runId: string, page = 1, signal?: AbortSignal) =>
    apiRequest<SourceHistory>(`/admin/digests/${digestId}/runs/${runId}/source-verifications?offset=${(page - 1) * 5}&limit=5`, { signal }),
  verifySources: (digestId: string, runId: string, settingsVersion: number) =>
    apiRequest<SourceVerification>(`/admin/digests/${digestId}/runs/${runId}/source-verifications`, {
      method: "POST", body: { expected_settings_version: settingsVersion },
    }),
  get: (signal?: AbortSignal) => apiRequest<QualitySettings>("/admin/research-quality", { signal }),
  history: (page: number) => apiRequest<QualityHistory>(`/admin/research-quality/history?offset=${(page - 1) * 20}&limit=20`),
  save: (payload: QualitySettingsUpdate) => apiRequest<QualitySettings>("/admin/research-quality", {
    method: "POST", body: payload,
  }),
  evaluations: (digestId: string, runId: string, page = 1, limit = 20, signal?: AbortSignal) =>
    apiRequest<QualityEvaluationHistory>(`/admin/digests/${digestId}/runs/${runId}/quality-evaluations?offset=${(page - 1) * limit}&limit=${limit}`, { signal }),
  evaluate: (digestId: string, runId: string, settingsVersion: number) =>
    apiRequest<QualityEvaluation>(`/admin/digests/${digestId}/runs/${runId}/quality-evaluations`, {
      method: "POST", body: { expected_settings_version: settingsVersion },
    }),
};
