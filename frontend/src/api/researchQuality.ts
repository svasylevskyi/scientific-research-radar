import { apiRequest } from "./client";
import type { components } from "../types/api.generated";

export type QualityConfig = components["schemas"]["QualityConfig"];
export type QualitySettings = components["schemas"]["QualitySettingsRead"];
export type QualityHistory = components["schemas"]["QualitySettingsHistory"];
export type QualitySettingsUpdate = components["schemas"]["QualitySettingsUpdate"];

export const researchQualityApi = {
  get: () => apiRequest<QualitySettings>("/admin/research-quality"),
  history: (page: number) => apiRequest<QualityHistory>(`/admin/research-quality/history?offset=${(page - 1) * 20}&limit=20`),
  save: (payload: QualitySettingsUpdate) => apiRequest<QualitySettings>("/admin/research-quality", {
    method: "POST", body: JSON.stringify(payload),
  }),
};
