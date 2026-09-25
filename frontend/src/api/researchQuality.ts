import { apiRequest } from "./client";
import type { components } from "../types/api.generated";

export type QualityConfig = components["schemas"]["QualityConfig"];
export type QualitySettings = components["schemas"]["QualitySettingsRead"];
export type QualityHistory = components["schemas"]["QualitySettingsHistory"];
export type QualitySettingsUpdate = components["schemas"]["QualitySettingsUpdate"];
export type QualityEvaluation = components["schemas"]["QualityEvaluationRead"];
export type QualityEvaluationHistory = components["schemas"]["QualityEvaluationHistory"];
export type QualitySnapshot = components["schemas"]["QualitySnapshot"];
export type QualityFinding = components["schemas"]["QualityFinding"];

export const researchQualityApi = {
  get: () => apiRequest<QualitySettings>("/admin/research-quality"),
  history: (page: number) => apiRequest<QualityHistory>(`/admin/research-quality/history?offset=${(page - 1) * 20}&limit=20`),
  save: (payload: QualitySettingsUpdate) => apiRequest<QualitySettings>("/admin/research-quality", {
    method: "POST", body: payload,
  }),
  evaluations: (digestId: string, runId: string, page = 1, limit = 20) =>
    apiRequest<QualityEvaluationHistory>(`/admin/digests/${digestId}/runs/${runId}/quality-evaluations?offset=${(page - 1) * limit}&limit=${limit}`),
  evaluate: (digestId: string, runId: string, settingsVersion: number) =>
    apiRequest<QualityEvaluation>(`/admin/digests/${digestId}/runs/${runId}/quality-evaluations`, {
      method: "POST", body: { expected_settings_version: settingsVersion },
    }),
};
