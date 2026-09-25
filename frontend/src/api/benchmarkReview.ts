import { apiRequest } from "./client";
import type { components } from "../types/api.generated";

export type BenchmarkSummary = components["schemas"]["BenchmarkSummary"];
export type BenchmarkDetail = components["schemas"]["BenchmarkDetail"];
export type BenchmarkCase = components["schemas"]["BenchmarkCaseRead"];
export type ReviewWrite = components["schemas"]["BenchmarkReviewWrite"];
export type CriteriaWrite = components["schemas"]["BenchmarkCriteriaWrite"];
export type BenchmarkAudit = components["schemas"]["BenchmarkAuditRead"];
export type BenchmarkExport = components["schemas"]["BenchmarkExport"];
export type ReviewState = components["schemas"]["BenchmarkCaseSummary"]["state"];

const base = "/admin/research-quality/benchmarks";
const casePath = (id: string, caseId: string) => `${base}/${id}/cases/${encodeURIComponent(caseId)}`;
export const benchmarkApi = {
  list: () => apiRequest<BenchmarkSummary[]>(base),
  detail: (id: string) => apiRequest<BenchmarkDetail>(`${base}/${id}`),
  case: (id: string, caseId: string, offset = 0) => apiRequest<BenchmarkCase>(`${casePath(id, caseId)}?offset=${offset}`),
  saveReview: (id: string, caseId: string, body: ReviewWrite) => apiRequest<BenchmarkCase>(casePath(id, caseId), { method: "POST", body }),
  saveCriteria: (id: string, body: CriteriaWrite) => apiRequest<BenchmarkDetail>(`${base}/${id}/criteria`, { method: "POST", body }),
  publish: (id: string, expected_revision: number, reason: string) =>
    apiRequest<components["schemas"]["BenchmarkPublicationRead"]>(`${base}/${id}/publications`, { method: "POST", body: { expected_revision, reason } }),
  history: (id: string, offset = 0) => apiRequest<BenchmarkAudit>(`${base}/${id}/history?offset=${offset}`),
  export: (id: string, publication?: number) => apiRequest<BenchmarkExport>(`${base}/${id}/export${publication ? `?publication=${publication}` : ""}`),
  importBenchmark: (benchmark: unknown) => apiRequest<BenchmarkDetail>(base, { method: "POST", body: { benchmark, permissions_checked: true } }),
  importReviews: (id: string, expected_revision: number, reviews: unknown) =>
    apiRequest<BenchmarkDetail>(`${base}/${id}/review-imports`, { method: "POST", body: { expected_revision, reviews } }),
};

export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
